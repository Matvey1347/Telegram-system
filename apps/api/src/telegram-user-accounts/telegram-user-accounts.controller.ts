import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import {
  Confirm2faPasswordDto,
  ConfirmLoginCodeDto,
  CreateTelegramUserAccountDto,
  ImportUserAccountChannelsDto,
  StartLoginDto,
  UpdateTelegramUserAccountDto,
} from './dto';
import { TelegramUserAccountsService } from './telegram-user-accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-user-accounts')
export class TelegramUserAccountsController {
  constructor(private readonly service: TelegramUserAccountsService) {}

  @Get() findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }
  @Get(':id/channels') channels(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.channels(user.sub, id);
  }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }
  @Post() create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramUserAccountDto,
  ) {
    return this.service.create(user.sub, dto);
  }
  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramUserAccountDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }

  @Post(':id/login/start') startLogin(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: StartLoginDto,
  ) {
    return this.service.startLogin(user.sub, id, dto);
  }
  @Post(':id/login/code') confirmCode(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ConfirmLoginCodeDto,
  ) {
    return this.service.confirmCode(user.sub, id, dto);
  }
  @Post(':id/login/password') confirmPassword(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: Confirm2faPasswordDto,
  ) {
    return this.service.confirmPassword(user.sub, id, dto);
  }
  @Post(':id/check') check(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.check(user.sub, id);
  }
  @Post(':id/sync-dialogs') syncDialogs(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.syncDialogs(user.sub, id);
  }
  @Post(':id/channels/import') importChannels(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ImportUserAccountChannelsDto,
  ) {
    return this.service.importChannels(user.sub, id, dto);
  }
}
