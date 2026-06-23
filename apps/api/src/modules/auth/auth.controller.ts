import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { VerifyTotpDto } from './dto/verify-totp.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: any, @Body() _dto: LoginDto) {
    return this.authService.login(req.user);
  }

  @Post('verify-totp')
  async verifyTotp(
    @Headers('authorization') authHeader: string,
    @Body() dto: VerifyTotpDto,
  ) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Partial token required');
    }
    const partialToken = authHeader.slice(7);
    return this.authService.verifyTotp(partialToken, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    return this.authService.getProfile(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('setup-totp')
  async setupTotp(@Req() req: any) {
    return this.authService.setupTotp(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm-totp')
  async confirmTotp(@Req() req: any, @Body() dto: VerifyTotpDto) {
    return this.authService.confirmTotp(req.user.sub, dto.code);
  }
}
