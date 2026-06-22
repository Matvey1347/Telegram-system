import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import type { JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-sync')
export class TelegramSyncController {
  constructor(
    private workspaceService: WorkspaceService,
    private prisma: PrismaService,
    private dailyAnalyticsSyncService: DailyAnalyticsSyncService,
  ) {}

  @Post('daily-analytics/run')
  async runDailyAnalytics(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.dailyAnalyticsSyncService.runDailyAnalyticsSync({
      workspaceId,
      source: 'manual',
    });
  }

  @Get('daily-analytics/last-run')
  async lastRun(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    return (this.prisma as any).dailyAnalyticsSyncRun.findFirst({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get('daily-analytics/runs')
  async runs(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
    return (this.prisma as any).dailyAnalyticsSyncRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: safeLimit,
    });
  }
}
