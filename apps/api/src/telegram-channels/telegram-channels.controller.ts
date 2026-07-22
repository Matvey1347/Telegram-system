import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  DeepSyncDto,
  CreatePostGroupDto,
  CreateTelegramChannelAdAnalysisDto,
  CreateTelegramManagedPostDto,
  CreateTelegramChannelDto,
  HistoricalSyncDto,
  ImportTelegramChannelDto,
  ManagedPostLinkTargetsQueryDto,
  TelegramChannelInviteLinksQueryDto,
  TelegramChannelListQueryDto,
  TelegramChannelPostsQueryDto,
  TelegramManagedPostsQueryDto,
  MovePostChannelDto,
  PostGroupsQueryDto,
  PostIdsDto,
  PublishPostGroupDto,
  ReorderManagedPostSidebarDto,
  ReorderPostGroupDto,
  SchedulePostGroupSequenceDto,
  SyncChannelStatsDto,
  SyncPostsMetricsDto,
  ScheduleTelegramManagedPostDto,
  SetManagedPostTelegramUrlDto,
  PublishTelegramManagedPostDto,
  SyncNowDto,
  UpdateTelegramChannelDto,
  UpdateTelegramChannelAdAnalysisDto,
  UpdateTelegramPostManualMetricsDto,
  UpdateTelegramManagedPostDto,
  UpdatePostGroupDto,
} from './dto';
import { TelegramChannelsService } from './telegram-channels.service';
import { StreamResponseService } from '../common/stream/stream-response.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelsController {
  constructor(
    private service: TelegramChannelsService,
    private readonly streamResponse: StreamResponseService,
  ) {}
  private async streamBulkAction(
    res: Response,
    action: (
      onProgress: (item: unknown, current: number, total: number) => void,
    ) => Promise<unknown>,
    eventPrefix: string,
  ) {
    return this.streamResponse.stream(res, { eventPrefix, action });
  }
  @Get() findAll(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramChannelListQueryDto,
  ) {
    return this.service.findAll(user.sub, query);
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
  @Post('import-stream')
  importStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramChannelDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.importChannel(user.sub, dto, onProgress as never),
      'telegram_channel.import_stream',
    );
  }
  @Get('post-groups')
  postGroups(@CurrentUser() user: JwtUser, @Query() query: PostGroupsQueryDto) {
    return this.service.postGroups(user.sub, query);
  }
  @Post('post-groups')
  createPostGroup(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePostGroupDto,
  ) {
    return this.service.createPostGroup(user.sub, dto);
  }
  @Get('post-groups/:groupId')
  postGroup(@CurrentUser() user: JwtUser, @Param('groupId') groupId: string) {
    return this.service.postGroup(user.sub, groupId);
  }
  @Patch('post-groups/:groupId')
  updatePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdatePostGroupDto,
  ) {
    return this.service.updatePostGroup(user.sub, groupId, dto);
  }
  @Delete('post-groups/:groupId')
  deletePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
  ) {
    return this.service.deletePostGroup(user.sub, groupId);
  }
  @Post('post-groups/:groupId/posts')
  addPostsToGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PostIdsDto,
  ) {
    return this.service.addPostsToGroup(user.sub, groupId, dto);
  }
  @Delete('post-groups/:groupId/posts/:postId')
  removePostFromGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Param('postId') postId: string,
  ) {
    return this.service.removePostFromGroup(user.sub, groupId, postId);
  }
  @Post('post-groups/:groupId/reorder')
  reorderPostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: ReorderPostGroupDto,
  ) {
    return this.service.reorderPostGroup(user.sub, groupId, dto);
  }
  @Post('post-groups/:groupId/move-channel')
  movePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: MovePostChannelDto,
  ) {
    return this.service.movePostGroup(user.sub, groupId, dto);
  }
  @Post('post-groups/:groupId/move-channel-stream')
  movePostGroupStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: MovePostChannelDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.movePostGroup(user.sub, groupId, dto, onProgress),
      'telegram_channel.post_group_move_stream',
    );
  }
  @Post('post-groups/:groupId/publish-all')
  publishPostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PublishPostGroupDto,
  ) {
    return this.service.publishPostGroup(user.sub, groupId, dto);
  }
  @Post('post-groups/:groupId/publish-all-stream')
  publishPostGroupStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PublishPostGroupDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.publishPostGroup(user.sub, groupId, dto, onProgress),
      'telegram_channel.post_group_publish_stream',
    );
  }
  @Post('post-groups/:groupId/reset-drafts')
  resetPostGroupToDrafts(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
  ) {
    return this.service.resetPostGroupToDrafts(user.sub, groupId);
  }
  @Post('post-groups/:groupId/reset-drafts-stream')
  resetPostGroupToDraftsStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.resetPostGroupToDrafts(user.sub, groupId, onProgress),
      'telegram_channel.post_group_reset_stream',
    );
  }
  @Post('post-groups/:groupId/schedule-sequence')
  schedulePostGroupSequence(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: SchedulePostGroupSequenceDto,
  ) {
    return this.service.schedulePostGroupSequence(user.sub, groupId, dto);
  }
  @Post('post-groups/:groupId/schedule-sequence-stream')
  schedulePostGroupSequenceStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: SchedulePostGroupSequenceDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.schedulePostGroupSequence(
          user.sub,
          groupId,
          dto,
          onProgress,
        ),
      'telegram_channel.post_group_schedule_sequence_stream',
    );
  }
  @Get(':id/managed-posts/link-targets')
  managedPostLinkTargets(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: ManagedPostLinkTargetsQueryDto,
  ) {
    return this.service.managedPostLinkTargets(user.sub, id, query);
  }
  @Get(':id/managed-posts')
  managedPosts(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: TelegramManagedPostsQueryDto,
  ) {
    return this.service.managedPosts(user.sub, id, query);
  }
  @Post(':id/managed-posts/sync')
  syncManagedPosts(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.syncManagedPosts(user.sub, id);
  }
  @Post(':id/managed-posts/sync-stream')
  syncManagedPostsStream(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.syncManagedPosts(user.sub, id, onProgress as never),
      'telegram_channel.managed_posts_sync_stream',
    );
  }
  @Patch(':id/managed-posts/:postId/telegram-url')
  setManagedPostTelegramUrl(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: SetManagedPostTelegramUrlDto,
  ) {
    return this.service.setManagedPostTelegramUrl(
      user.sub,
      id,
      postId,
      dto.telegramUrl,
    );
  }
  @Get(':id/managed-posts/:postId/history')
  managedPostHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ) {
    return this.service.managedPostHistory(user.sub, id, postId);
  }
  @Post(':id/managed-posts/:postId/history/:revisionId/restore')
  restoreManagedPostHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.service.restoreManagedPostRevision(
      user.sub,
      id,
      postId,
      revisionId,
    );
  }
  @Post(':id/managed-posts/reorder-sidebar')
  reorderManagedPostSidebar(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() dto: ReorderManagedPostSidebarDto,
  ) {
    return this.service.reorderManagedPostSidebar(user.sub, channelId, dto);
  }
  @Post(':id/managed-posts')
  createManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramManagedPostDto,
  ) {
    return this.service.createManagedPost(user.sub, id, dto);
  }
  @Patch(':id/managed-posts/:postId')
  updateManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: UpdateTelegramManagedPostDto,
  ) {
    return this.service.updateManagedPost(user.sub, id, postId, dto);
  }
  @Post(':id/managed-posts/:postId/move-channel')
  moveManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: MovePostChannelDto,
  ) {
    return this.service.moveManagedPost(user.sub, id, postId, dto);
  }
  @Post(':id/managed-posts/:postId/publish')
  publishManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: PublishTelegramManagedPostDto,
  ) {
    return this.service.publishManagedPostNow(user.sub, id, postId, dto);
  }
  @Post(':id/managed-posts/:postId/schedule')
  scheduleManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: ScheduleTelegramManagedPostDto,
  ) {
    return this.service.scheduleManagedPost(user.sub, id, postId, dto);
  }
  @Delete(':id/managed-posts/:postId')
  deleteManagedPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ) {
    return this.service.deleteManagedPost(user.sub, id, postId);
  }
  @Get(':id/ad-analyses')
  adAnalyses(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.adAnalyses(user.sub, id);
  }
  @Post(':id/ad-analyses')
  createAdAnalysis(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramChannelAdAnalysisDto,
  ) {
    return this.service.createAdAnalysis(user.sub, id, dto);
  }
  @Patch(':id/ad-analyses/:analysisId')
  updateAdAnalysis(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('analysisId') analysisId: string,
    @Body() dto: UpdateTelegramChannelAdAnalysisDto,
  ) {
    return this.service.updateAdAnalysis(user.sub, id, analysisId, dto);
  }
  @Delete(':id/ad-analyses/:analysisId')
  deleteAdAnalysis(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('analysisId') analysisId: string,
  ) {
    return this.service.deleteAdAnalysis(user.sub, id, analysisId);
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
  @Get(':id/audience') audience(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.audience(user.sub, id);
  }
  @Post(':id/audience-snapshot') createAudienceSnapshot(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.createAudienceSnapshot(user.sub, id, 'manual');
  }
  @Get(':id/audience-snapshots') audienceSnapshots(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.audienceSnapshots(user.sub, id, Number(limit || 50));
  }
  @Get(':id/financial-summary') financialSummary(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.financialSummary(user.sub, id);
  }
  @Get(':id/export') async exportChannel(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.service.exportChannelWorkbook(
      user.sub,
      id,
    );
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    response.send(buffer);
  }
  @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
  @Post(':id/sync-now') syncNow(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SyncNowDto,
  ) {
    return this.service.syncNow(user.sub, id, dto);
  }
  @Post(':id/sync-now-stream') syncNowStream(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SyncNowDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.syncNow(user.sub, id, dto, onProgress as never),
      'telegram_channel.sync_now_stream',
    );
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
  @Get(':id/posts/:postId/media')
  async telegramPostMedia(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Res() response: Response,
  ) {
    const media = await this.service.telegramPostMedia(user.sub, id, postId);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.send(media.buffer);
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
    return this.service.channelStatsSnapshots(
      user.sub,
      id,
      Number(limit || 20),
    );
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
    @Query() query: TelegramChannelInviteLinksQueryDto,
  ) {
    return this.service.inviteLinks(user.sub, id, query);
  }
  @Get(':id/invite-links/:inviteLinkId/history')
  inviteLinkHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('inviteLinkId') inviteLinkId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.inviteLinkHistory(
      user.sub,
      id,
      inviteLinkId,
      Number(limit || 120),
    );
  }
  @Get(':id/promos')
  promos(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.promosByChannel(user.sub, id);
  }
  @Get(':id/posts')
  posts(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: TelegramChannelPostsQueryDto,
  ) {
    return this.service.posts(user.sub, id, query);
  }
  @Patch(':channelId/posts/:postId/manual-metrics')
  updatePostManualMetrics(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Param('postId') postId: string,
    @Body() dto: UpdateTelegramPostManualMetricsDto,
  ) {
    return this.service.updatePostManualMetrics(
      user.sub,
      channelId,
      postId,
      dto,
    );
  }
}
