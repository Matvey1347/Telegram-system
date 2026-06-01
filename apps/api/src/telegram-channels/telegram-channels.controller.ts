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
  CheckBotAccessDto,
  CreateInviteLinkDto,
  DeepSyncDto,
  CreateTelegramChannelDto,
  HistoricalSyncDto,
  SyncPostsMetricsDto,
  UpdateInviteLinkDto,
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
  @Post(':id/check-bot-access') checkBotAccess(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CheckBotAccessDto,
  ) {
    return this.service.checkBotAccess(user.sub, id, dto);
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
  @Get(':id/analytics') analytics(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.analytics(user.sub, id, from, to);
  }
  @Get(':id/events') events(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const safePage = Number(page || 1);
    const safeLimit = Number(limit || 50);
    return this.service.events(user.sub, id, safePage, safeLimit);
  }
  @Get(':id/update-logs')
  updateLogs(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.updateLogs(
      user.sub,
      id,
      Number(limit || 50),
      Number(offset || 0),
    );
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
  @Post(':id/sync-subscribers-count')
  syncSubscribersCount(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.syncSubscribersCount(user.sub, id);
  }
  @Post(':id/invite-links') createInviteLink(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateInviteLinkDto,
  ) {
    return this.service.createInviteLink(user.sub, id, dto);
  }
  @Patch('invite-links/:inviteLinkId') updateInviteLink(
    @CurrentUser() user: JwtUser,
    @Param('inviteLinkId') inviteLinkId: string,
    @Body() dto: UpdateInviteLinkDto,
  ) {
    return this.service.updateInviteLink(user.sub, inviteLinkId, dto);
  }
  @Post('invite-links/:inviteLinkId/revoke') revokeInviteLink(
    @CurrentUser() user: JwtUser,
    @Param('inviteLinkId') inviteLinkId: string,
  ) {
    return this.service.revokeInviteLink(user.sub, inviteLinkId);
  }
}
