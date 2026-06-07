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
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  DeepSyncDto,
  CreateTelegramChannelDto,
  HistoricalSyncDto,
  ImportTelegramChannelDto,
  SyncChannelStatsDto,
  SyncPostsMetricsDto,
  UpdateTelegramChannelDto,
} from './dto';
import { TelegramChannelsService } from './telegram-channels.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelsController {
  constructor(private service: TelegramChannelsService) {}
  @Get() findAll(@CurrentUser() user: JwtUser) {
    return this.service.findAll(user.sub);
  }
  @Post() create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramChannelDto,
  ) {
    return this.service.create(user.sub, dto);
  }
  @Post('import')
  import(@CurrentUser() user: JwtUser, @Body() dto: ImportTelegramChannelDto) {
    return this.service.importChannel(user.sub, dto);
  }
  @Get(':id') findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.findOne(user.sub, id);
  }
  @Patch(':id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramChannelDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
  @Post(':id/sync-now') syncNow(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.syncNow(user.sub, id);
  }
  @Post(':id/sync/historical') syncHistorical(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: HistoricalSyncDto,
  ) {
    return this.service.syncHistorical(user.sub, id, dto);
  }
  @Post(':id/sync/deep') deepSync(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: DeepSyncDto,
  ) {
    return this.service.deepSync(user.sub, id, dto);
  }
  @Post(':id/sync-posts-metrics')
  syncPostsMetrics(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SyncPostsMetricsDto,
  ) {
    return this.service.syncPostsMetrics(user.sub, id, dto);
  }
  @Post(':id/sync-stats')
  syncStats(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SyncChannelStatsDto,
  ) {
    return this.service.syncBroadcastStats(user.sub, id, dto);
  }
  @Get(':id/stats-snapshots')
  statsSnapshots(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.channelStatsSnapshots(user.sub, id, Number(limit || 20));
  }
  @Get(':id/sources')
  sources(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.channelSources(user.sub, id);
  }
  @Get(':id/analytics-sources')
  analyticsSources(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.analyticsSources(user.sub, id);
  }
  @Get(':id/analytics') analytics(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.analytics(user.sub, id, from, to);
  }
  @Get(':id/invite-links') inviteLinks(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.inviteLinks(user.sub, id);
  }
  @Get(':id/promos')
  promos(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.promosByChannel(user.sub, id);
  }
  @Get(':id/posts')
  posts(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.posts(
      user.sub,
      id,
      Number(limit || 50),
      Number(offset || 0),
    );
  }
}
