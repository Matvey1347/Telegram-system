import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AccountService } from './account.service';
import { UpdateMeDto, UpdatePasswordDto, UpdateWorkspaceDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly service: AccountService) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.service.me(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: JwtUser, @Body() dto: UpdateMeDto) {
    return this.service.updateMe(user.sub, dto);
  }

  @Patch('password')
  updatePassword(@CurrentUser() user: JwtUser, @Body() dto: UpdatePasswordDto) {
    return this.service.updatePassword(user.sub, dto);
  }

  @Patch('workspace')
  updateWorkspace(@CurrentUser() user: JwtUser, @Body() dto: UpdateWorkspaceDto) {
    return this.service.updateWorkspace(user.sub, dto);
  }
}
