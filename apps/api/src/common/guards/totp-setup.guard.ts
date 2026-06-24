import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SKIP_TOTP_CHECK_KEY } from '../decorators/skip-totp-check.decorator';

@Injectable()
export class TotpSetupGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TOTP_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) return true;

    try {
      const payload = this.jwtService.verify(authHeader.slice(7));
      if (payload.totpEnabled === false) {
        throw new ForbiddenException('TOTP setup required before accessing this resource');
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
    }

    return true;
  }
}
