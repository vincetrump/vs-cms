import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Patch,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipPasswordChangeCheck } from '../../common/decorators/skip-password-change-check.decorator';
import { SkipTotpCheck } from '../../common/decorators/skip-totp-check.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { IsString, MinLength } from 'class-validator';
import { JwtService } from '@nestjs/jwt';

class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  @Get()
  @Roles('admin')
  async list() {
    const users = await this.usersService.findAll();
    return users.map((u) => ({
      id: u._id,
      username: u.username,
      role: u.role,
      totpEnabled: u.totpEnabled,
      mustChangePassword: u.mustChangePassword,
      createdAt: (u as any).createdAt,
    }));
  }

  @Post()
  @Roles('admin')
  async create(@Body() dto: CreateUserDto) {
    const existing = await this.usersService.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already exists');
    }
    const user = await this.usersService.create(dto.username, dto.password, dto.role, true);
    return {
      id: user._id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  @Delete(':id')
  @Roles('admin')
  async remove(@Req() req: any, @Param('id') id: string) {
    if (req.user.sub === id) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    await this.usersService.deleteUser(id);
    return { success: true };
  }

  @Patch('change-password')
  @SkipPasswordChangeCheck()
  @SkipTotpCheck()
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) throw new NotFoundException('User not found');

    const valid = await this.usersService.validatePassword(user, dto.currentPassword);
    if (!valid) {
      return { success: false, message: 'Current password is incorrect' };
    }

    await this.usersService.changePassword(req.user.sub, dto.newPassword);

    if (user.mustChangePassword) {
      await this.usersService.clearMustChangePassword(req.user.sub);
      const newToken = this.jwtService.sign({
        sub: req.user.sub,
        username: user.username,
        role: user.role,
        totpVerified: true,
        totpEnabled: user.totpEnabled,
        mustChangePassword: false,
      });
      return { success: true, message: 'Password changed successfully', accessToken: newToken };
    }

    return { success: true, message: 'Password changed successfully' };
  }
}
