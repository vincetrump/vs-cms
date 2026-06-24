import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { User, UserDocument } from './schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
  ) {
    const keyHex = this.configService.get<string>('totp.encryptionKey', '');
    this.encryptionKey = Buffer.from(keyHex.padEnd(32, '0').slice(0, 32));
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ username });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id);
  }

  async create(username: string, password: string, role = 'admin', mustChangePassword = false): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(password, 12);
    return this.userModel.create({ username, passwordHash, role, mustChangePassword });
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 });
  }

  async deleteUser(id: string): Promise<void> {
    await this.userModel.findByIdAndDelete(id);
  }

  async clearMustChangePassword(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { mustChangePassword: false });
  }

  async validatePassword(user: UserDocument, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userModel.findByIdAndUpdate(userId, { passwordHash });
  }

  async generateTotpSecret(user: UserDocument): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = authenticator.generateSecret();
    const encrypted = this.encryptSecret(secret);
    await this.userModel.findByIdAndUpdate(user._id, { totpSecret: encrypted });

    const otpauthUrl = authenticator.keyuri(user.username, 'VS-CMS', secret);
    return { secret, otpauthUrl };
  }

  async enableTotp(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { totpEnabled: true });
  }

  async verifyTotp(user: UserDocument, token: string): Promise<boolean> {
    if (!user.totpSecret) return false;
    const secret = this.decryptSecret(user.totpSecret);
    return authenticator.verify({ token, secret });
  }

  private encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptSecret(encryptedSecret: string): string {
    const [ivHex, encrypted] = encryptedSecret.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async seedAdmin(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    const existing = await this.findByUsername('admin');
    if (!existing) {
      await this.create('admin', 'admin123', 'admin');
    }

    const saleExists = await this.findByUsername('sale');
    if (!saleExists) {
      await this.create('sale', 'sale123', 'sale');
    }
  }
}
