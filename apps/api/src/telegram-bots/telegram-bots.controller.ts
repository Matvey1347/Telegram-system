import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateTelegramBotDto, ImportTelegramChannelsDto, UpdateTelegramBotDto } from './dto';
import { TelegramBotsService } from './telegram-bots.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots')
export class TelegramBotsController {
  constructor(private service: TelegramBotsService) {}

  @Get() findAll(@CurrentUser() user: JwtUser) { return this.service.findAll(user.sub); }
  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreateTelegramBotDto) { return this.service.create(user.sub, dto); }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.findOne(user.sub, id); }
  @Patch(':id') update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateTelegramBotDto) { return this.service.update(user.sub, id, dto); }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.remove(user.sub, id); }
  @Post(':id/activate') activate(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.activate(user.sub, id); }
  @Post(':id/check') check(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.service.check(user.sub, id); }
  @Post(':id/import-channels') importChannels(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: ImportTelegramChannelsDto) { return this.service.importChannels(user.sub, id, dto); }
}
