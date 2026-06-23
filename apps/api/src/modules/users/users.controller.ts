import { Controller, Post, Body, UseGuards, Req, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { IsString, MinLength } from 'class-validator';

class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) throw new Error('User not found');

    const valid = await this.usersService.validatePassword(user, dto.currentPassword);
    if (!valid) {
      return { success: false, message: 'Current password is incorrect' };
    }

    await this.usersService.changePassword(req.user.sub, dto.newPassword);
    return { success: true, message: 'Password changed successfully' };
  }
}
