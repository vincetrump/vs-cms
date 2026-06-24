import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any) {
    if (!payload.totpVerified) {
      throw new UnauthorizedException('TOTP verification required');
    }
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
      totpEnabled: !!payload.totpEnabled,
      mustChangePassword: !!payload.mustChangePassword,
    };
  }
}
