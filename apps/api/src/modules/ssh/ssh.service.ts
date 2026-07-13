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
  private pending = new Map<string, Promise<Client>>();
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

    const inflight = this.pending.get(ip);
    if (inflight) return inflight;

    const promise = new Promise<Client>((resolve, reject) => {
      const conn = new Client();
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH connection timeout to ${ip}`));
      }, 10000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        this.connections.set(ip, conn);
        this.pending.delete(ip);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        this.connections.delete(ip);
        this.pending.delete(ip);
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

    this.pending.set(ip, promise);
    return promise;
  }

  private reconnect(serverIp?: string): void {
    const ip = serverIp || this.configService.get<string>('ssh.defaultServer', '');
    const conn = this.connections.get(ip);
    if (conn) {
      conn.end();
      this.connections.delete(ip);
    }
  }

  async executeCommand(command: string, serverIp?: string): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const conn = await this.getConnection(serverIp);
      try {
        return await new Promise<string>((resolve, reject) => {
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
      } catch (err: any) {
        if (attempt === 0 && (err?.message?.includes('Channel open failure') || err?.message?.includes('Unable to exec'))) {
          this.logger.warn(`SSH exec channel failure, reconnecting to ${serverIp}`);
          this.reconnect(serverIp);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
    throw new Error('SSH executeCommand failed after retry');
  }

  async readFile(filePath: string, serverIp?: string): Promise<string> {
    const safe = this.validatePath(filePath);
    return this.executeCommand(`cat '${safe.replace(/'/g, "'\\''")}'`, serverIp);
  }

  async writeFile(filePath: string, content: string, serverIp?: string): Promise<void> {
    const safe = this.validatePath(filePath);
    for (let attempt = 0; attempt < 2; attempt++) {
      const conn = await this.getConnection(serverIp);
      try {
        return await new Promise<void>((resolve, reject) => {
          conn.sftp((err, sftp) => {
            if (err) return reject(err);
            const writeStream = sftp.createWriteStream(safe);
            writeStream.on('close', () => resolve());
            writeStream.on('error', reject);
            writeStream.end(content, 'utf8');
          });
        });
      } catch (err: any) {
        if (attempt === 0 && (err?.message?.includes('Channel open failure') || err?.message?.includes('Unable to start subsystem'))) {
          this.logger.warn(`SSH SFTP channel failure, reconnecting to ${serverIp}`);
          this.reconnect(serverIp);
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw err;
      }
    }
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

  async directoryExists(dirPath: string, serverIp?: string): Promise<boolean> {
    const safe = this.validatePath(dirPath);
    try {
      const result = await this.executeCommand(
        `test -d '${safe.replace(/'/g, "'\\''")}' && echo "exists"`,
        serverIp,
      );
      return result.trim() === 'exists';
    } catch {
      return false;
    }
  }

  async createDirectory(dirPath: string, serverIp?: string): Promise<void> {
    const safe = this.validatePath(dirPath);
    await this.executeCommand(`mkdir -p '${safe.replace(/'/g, "'\\''")}'`, serverIp);
  }

  async deleteFile(filePath: string, serverIp?: string): Promise<void> {
    const safe = this.validatePath(filePath);
    await this.executeCommand(`rm -f '${safe.replace(/'/g, "'\\''")}'`, serverIp);
  }

  async removeDirIfEmpty(dirPath: string, serverIp?: string): Promise<void> {
    const safe = this.validatePath(dirPath);
    await this.executeCommand(
      `rmdir '${safe.replace(/'/g, "'\\''")}' 2>/dev/null || true`,
      serverIp,
    );
  }

  async listCategoryDirs(docRoot: string, serverIp?: string): Promise<string[]> {
    const safe = this.validatePath(docRoot).replace(/\/$/, '');
    const escaped = safe.replace(/'/g, "'\\''");
    const result = await this.executeCommand(
      `for d in '${escaped}'/*/; do [ -f "$d/index.html" ] && basename "$d"; done 2>/dev/null || true`,
      serverIp,
    );
    return result.trim().split('\n').filter(Boolean);
  }

  // Tìm tối đa 3 trang detail (/{category}/{slug}/index.html) — dùng làm mẫu build article template
  async findDetailPages(docRoot: string, serverIp?: string): Promise<string[]> {
    const safe = this.validatePath(docRoot).replace(/\/$/, '');
    const escaped = safe.replace(/'/g, "'\\''");
    const result = await this.executeCommand(
      `find '${escaped}' -mindepth 3 -maxdepth 3 -name index.html -not -path "*/\\.*" 2>/dev/null | head -3`,
      serverIp,
    );
    return result.trim().split('\n').filter(Boolean);
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

  async scanSubPages(
    documentRoot: string,
    serverIp?: string,
  ): Promise<Array<{ pagePath: string; filePath: string; hasFooter: boolean }>> {
    const safe = this.validatePath(documentRoot);

    const findResult = await this.executeCommand(
      `find '${safe.replace(/'/g, "'\\''")}' -mindepth 2 -maxdepth 3 -name "index.html" -not -path "*/\\.*" 2>/dev/null || echo ""`,
      serverIp,
    );

    const files = findResult.trim().split('\n').filter(Boolean);
    if (!files.length) return [];

    let footerFiles = new Set<string>();
    try {
      const grepResult = await this.executeCommand(
        `grep -rl "<footer" ${files.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' ')} 2>/dev/null || echo ""`,
        serverIp,
      );
      footerFiles = new Set(grepResult.trim().split('\n').filter(Boolean));
    } catch {
      this.logger.warn('Footer grep failed, marking all as no-footer');
    }

    return files.map((filePath) => {
      const relative = filePath.replace(safe, '').replace(/^\//, '');
      const parts = relative.split('/');
      parts.pop();
      const pagePath = '/' + parts.join('/') + '/';
      return {
        pagePath,
        filePath,
        hasFooter: footerFiles.has(filePath),
      };
    });
  }

  disconnectAll() {
    for (const [, conn] of this.connections) {
      conn.end();
    }
    this.connections.clear();
  }
}
