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
  UpdateTelegramChannelDto,
  UpdateTelegramChannelAdAnalysisDto,
  UpdateTelegramPostManualMetricsDto,
  UpdateTelegramManagedPostDto,
  UpdatePostGroupDto,
} from './dto';
import { TelegramChannelsService } from './telegram-channels.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelsController {
  constructor(private service: TelegramChannelsService) {}
  private async streamBulkAction(
    res: Response,
    action: (
      onProgress: (item: unknown, current: number, total: number) => void,
    ) => Promise<unknown>,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    try {
      const result = await action((item, current, total) => {
        res.write(
          `${JSON.stringify({ type: 'progress', item, current, total })}\n`,
        );
      });
      res.write(`${JSON.stringify({ type: 'complete', result })}\n`);
    } catch (error) {
      res.write(
        `${JSON.stringify({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Bulk action failed',
        })}\n`,
      );
    } finally {
      res.end();
    }
  }
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
    return this.streamBulkAction(res, (onProgress) =>
      this.service.movePostGroup(user.sub, groupId, dto, onProgress),
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
    return this.streamBulkAction(res, (onProgress) =>
      this.service.publishPostGroup(user.sub, groupId, dto, onProgress),
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
    return this.streamBulkAction(res, (onProgress) =>
      this.service.resetPostGroupToDrafts(user.sub, groupId, onProgress),
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
    return this.streamBulkAction(res, (onProgress) =>
      this.service.schedulePostGroupSequence(
        user.sub,
        groupId,
        dto,
        onProgress,
      ),
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
  managedPosts(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.managedPosts(user.sub, id);
  }
  @Post(':id/managed-posts/sync')
  syncManagedPosts(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.syncManagedPosts(user.sub, id);
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
