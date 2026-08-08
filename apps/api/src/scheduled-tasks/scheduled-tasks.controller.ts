import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceService } from '../common/workspace.service';
import { UpdateScheduledTaskDto } from './dto';
import { ScheduledTasksService } from './scheduled-tasks.service';
import type { UpdateScheduledTaskPayload } from '@telegram-system/shared';

@UseGuards(JwtAuthGuard)
@Controller('scheduled-tasks')
export class ScheduledTasksController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly service: ScheduledTasksService,
  ) {}

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(user.sub);
    return this.service.listForMembership(membership);
  }

  @Get(':taskKey/runs')
  async runs(
    @CurrentUser() user: JwtUser,
    @Param('taskKey') taskKey: string,
    @Query('limit') limit?: string,
  ) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(user.sub);
    return this.service.runsForMembership(
      membership,
      taskKey,
      Number(limit || 20),
    );
  }

  @Patch(':taskKey')
  async update(
    @CurrentUser() user: JwtUser,
    @Param('taskKey') taskKey: string,
    @Body() dto: UpdateScheduledTaskDto,
  ) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(user.sub);
    return this.service.updateForMembership(
      membership,
      taskKey,
      dto as UpdateScheduledTaskPayload,
    );
  }

  @Post(':taskKey/run')
  async runNow(
    @CurrentUser() user: JwtUser,
    @Param('taskKey') taskKey: string,
  ) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(user.sub);
    return this.service.runNowForMembership(membership, taskKey);
  }
}
