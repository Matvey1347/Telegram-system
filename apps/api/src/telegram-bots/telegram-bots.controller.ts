import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateTelegramBotDto, UpdateTelegramBotDto } from './dto';
import { TelegramBotsService } from './telegram-bots.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots')
export class TelegramBotsController {
  constructor(private readonly service: TelegramBotsService) {}

  @Get() findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }

  @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreateTelegramBotDto) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramBotDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Post(':id/check') check(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.check(user.sub, id);
  }

  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
