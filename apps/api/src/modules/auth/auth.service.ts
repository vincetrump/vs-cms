import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as QRCode from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(user: any) {
    const dbUser = await this.usersService.findByUsername(user.username);
    if (!dbUser) throw new UnauthorizedException();

    if (dbUser.totpEnabled) {
      const partialToken = this.jwtService.sign(
        {
          sub: user.sub, username: user.username, role: user.role,
          totpVerified: false, totpEnabled: true,
          mustChangePassword: !!dbUser.mustChangePassword,
        },
        { expiresIn: '5m' },
      );
      return { requireTotp: true, partialToken };
    }

    const fullToken = this.jwtService.sign({
      sub: user.sub,
      username: user.username,
      role: user.role,
      totpVerified: true,
      totpEnabled: false,
      mustChangePassword: !!dbUser.mustChangePassword,
    });
    return {
      requireTotp: false,
      requireTotpSetup: true,
      requirePasswordChange: !!dbUser.mustChangePassword,
      accessToken: fullToken,
    };
  }

  async verifyTotp(partialToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(partialToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.totpVerified) {
      throw new UnauthorizedException('Token already verified');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await this.usersService.verifyTotp(user, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const fullToken = this.jwtService.sign({
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      totpVerified: true,
      totpEnabled: true,
      mustChangePassword: !!payload.mustChangePassword,
    });
    return {
      accessToken: fullToken,
      requirePasswordChange: !!payload.mustChangePassword,
    };
  }

  async setupTotp(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    if (user.totpEnabled) {
      throw new UnauthorizedException('TOTP is already enabled. Disable it first to re-enroll.');
    }

    const { secret, otpauthUrl } = await this.usersService.generateTotpSecret(user);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { qrCodeDataUrl, secret };
  }

  async confirmTotp(userId: string, code: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await this.usersService.verifyTotp(user, code);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code. Please try again.');
    }

    await this.usersService.enableTotp(userId);
    const newToken = this.jwtService.sign({
      sub: userId,
      username: user.username,
      role: user.role,
      totpVerified: true,
      totpEnabled: true,
      mustChangePassword: !!user.mustChangePassword,
    });
    return { success: true, message: 'TOTP enabled successfully', accessToken: newToken };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();
    return {
      id: user._id,
      username: user.username,
      role: user.role,
      totpEnabled: user.totpEnabled,
      mustChangePassword: !!user.mustChangePassword,
    };
  }
}
