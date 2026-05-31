import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CheckBotAccessDto, CreateTelegramChannelDto, UpdateTelegramChannelDto } from './dto';
import { TelegramChannelsService } from './telegram-channels.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelsController {
  constructor(private service: TelegramChannelsService) {}
  @Get() findAll(@CurrentUser() user: JwtUser) { return this.service.findAll(user.sub); }
  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreateTelegramChannelDto) { return this.service.create(user.sub, dto); }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.findOne(user.sub, id); }
  @Patch(':id') update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTelegramChannelDto) { return this.service.update(user.sub, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.remove(user.sub, id); }
  @Post(':id/check-bot-access') checkBotAccess(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: CheckBotAccessDto) { return this.service.checkBotAccess(user.sub, id, dto); }
}
