import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const signature = request.headers['x-signature'];
    const timestamp = request.headers['x-timestamp'];

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const keyDoc = await this.apiKeysService.validateKey(apiKey);
    if (!keyDoc) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (signature && timestamp) {
      const body = JSON.stringify(request.body || {});
      const valid = await this.apiKeysService.validateHmac(keyDoc, body, timestamp, signature);
      if (!valid) {
        throw new UnauthorizedException('Invalid HMAC signature');
      }
    }

    request.apiKey = keyDoc;
    return true;
  }
}
