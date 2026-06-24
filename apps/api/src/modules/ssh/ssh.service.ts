import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_PATH_ROOTS = ['/home/', '/usr/local/lsws/', '/var/www/', '/tmp/'];

@Injectable()
export class SshService implements OnModuleDestroy {
  private readonly logger = new Logger(SshService.name);
  private connections = new Map<string, Client>();
  private privateKey: Buffer | null = null;

  constructor(private configService: ConfigService) {
    const keyPath = this.configService.get<string>('ssh.privateKeyPath', '');
    if (keyPath && fs.existsSync(keyPath)) {
      this.privateKey = fs.readFileSync(keyPath);
    }
  }

  private validatePath(filePath: string): string {
    if (/[\x00-\x1f\x7f]/.test(filePath)) {
      throw new Error('File path contains invalid control characters');
    }
    const normalized = path.normalize(filePath);
    if (!ALLOWED_PATH_ROOTS.some((root) => normalized.startsWith(root))) {
      throw new Error(`Path ${filePath} is outside allowed roots`);
    }
    return normalized;
  }

  onModuleDestroy() {
    for (const [, conn] of this.connections) {
      conn.end();
    }
    this.connections.clear();
  }

  private async getConnection(serverIp?: string): Promise<Client> {
    const ip = serverIp || this.configService.get<string>('ssh.defaultServer', '');
    const user = this.configService.get<string>('ssh.defaultUser', 'root');

    const existing = this.connections.get(ip);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH connection timeout to ${ip}`));
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        this.connections.set(ip, conn);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        this.connections.delete(ip);
        reject(err);
      });

      conn.on('close', () => {
        this.connections.delete(ip);
      });

      const connectConfig: any = { host: ip, port: 22, username: user };
      if (this.privateKey) {
        connectConfig.privateKey = this.privateKey;
      }
      conn.connect(connectConfig);
    });
  }

  async executeCommand(command: string, serverIp?: string): Promise<string> {
    const conn = await this.getConnection(serverIp);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Command timeout')), 30000);

      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timeout); return reject(err); }

        let stdout = '';
        let stderr = '';

        stream.on('close', () => {
          clearTimeout(timeout);
          if (stderr && !stdout) {
            this.logger.warn(`SSH stderr: ${stderr.trim()}`);
          }
          resolve(stdout);
        });

        stream.on('data', (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      });
    });
  }

  async readFile(filePath: string, serverIp?: string): Promise<string> {
    const safe = this.validatePath(filePath);
    return this.executeCommand(`cat '${safe.replace(/'/g, "'\\''")}'`, serverIp);
  }

  async writeFile(filePath: string, content: string, serverIp?: string): Promise<void> {
    const safe = this.validatePath(filePath);
    const conn = await this.getConnection(serverIp);
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);

        const writeStream = sftp.createWriteStream(safe);
        writeStream.on('close', () => resolve());
        writeStream.on('error', reject);
        writeStream.end(content, 'utf8');
      });
    });
  }

  async backupFile(filePath: string, serverIp?: string): Promise<string> {
    const safe = this.validatePath(filePath);
    const backupPath = `${safe}.bak.${Date.now()}`;
    await this.executeCommand(
      `cp '${safe.replace(/'/g, "'\\''")}' '${backupPath.replace(/'/g, "'\\''")}'`,
      serverIp,
    );
    return backupPath;
  }

  async fileExists(filePath: string, serverIp?: string): Promise<boolean> {
    const safe = this.validatePath(filePath);
    try {
      const result = await this.executeCommand(
        `test -f '${safe.replace(/'/g, "'\\''")}' && echo "exists"`,
        serverIp,
      );
      return result.trim() === 'exists';
    } catch {
      return false;
    }
  }

  async findLiteSpeedDocRoots(serverIp?: string): Promise<Map<string, string>> {
    const docRoots = new Map<string, string>();

    try {
      const vhostDirs = await this.executeCommand(
        `ls -d /usr/local/lsws/conf/vhosts/*/ 2>/dev/null || echo ""`,
        serverIp,
      );

      for (const dir of vhostDirs.trim().split('\n').filter(Boolean)) {
        const vhconfPath = `${dir}vhconf.conf`;
        try {
          const config = await this.readFile(vhconfPath, serverIp);
          const docRootMatch = config.match(/docRoot\s+(.+)/);
          if (docRootMatch) {
            const domainName = dir.split('/').filter(Boolean).pop() || '';
            let docRoot = docRootMatch[1].trim();
            docRoot = docRoot.replace(/\$VH_ROOT/g, `/usr/local/lsws/conf/vhosts/${domainName}`);
            docRoots.set(domainName, docRoot);
          }
        } catch {
          this.logger.warn(`Could not read ${vhconfPath}`);
        }
      }
    } catch {
      this.logger.warn('LiteSpeed vhosts not found, trying alternative paths');
    }

    try {
      const homeDirs = await this.executeCommand(
        `ls -d /home/*/public_html/ 2>/dev/null || echo ""`,
        serverIp,
      );

      for (const dir of homeDirs.trim().split('\n').filter(Boolean)) {
        const parts = dir.split('/');
        const domainCandidate = parts[2];
        if (domainCandidate && !docRoots.has(domainCandidate)) {
          docRoots.set(domainCandidate, dir.replace(/\/$/, ''));
        }
      }
    } catch {
      this.logger.warn('Could not scan /home/*/public_html');
    }

    return docRoots;
  }

  async findHomepageFile(docRoot: string, serverIp?: string): Promise<string | null> {
    const candidates = ['index.html', 'index.php', 'index.htm'];
    for (const file of candidates) {
      const exists = await this.fileExists(`${docRoot}/${file}`, serverIp);
      if (exists) return `${docRoot}/${file}`;
    }
    return null;
  }

  disconnectAll() {
    for (const [, conn] of this.connections) {
      conn.end();
    }
    this.connections.clear();
  }
}
