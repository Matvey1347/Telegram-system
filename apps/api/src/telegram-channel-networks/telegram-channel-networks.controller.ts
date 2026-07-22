import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateTelegramChannelNetworkDto } from './dto/create-telegram-channel-network.dto';
import { UpdateTelegramChannelNetworkDto } from './dto/update-telegram-channel-network.dto';
import { TelegramChannelNetworksService } from './telegram-channel-networks.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channel-networks')
export class TelegramChannelNetworksController {
  constructor(private service: TelegramChannelNetworksService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: PaginationQueryDto) {
    return this.service.list(user.sub, query);
  }

  @Get(':id/summary')
  summary(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getNetworkSummary(user.sub, id);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.getById(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramChannelNetworkDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramChannelNetworkDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
