import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  TelegramManagedPostStatus,
  type TelegramPostPlannerFormat,
  type TelegramPostPlannerSlot,
} from '@prisma/client';
import type {
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerAssignment,
  TelegramPostPlannerPreviewResult,
} from '@telegram-system/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import {
  utcDateKey,
  zonedDateTimeToUtc,
} from '../telegram-ad-sales/domain/timezone';
import { TelegramChannelsService } from './telegram-channels.service';
import {
  CreatePostPlannerFormatDto,
  CreatePostPlannerSlotDto,
  PostPlannerApplyDto,
  PostPlannerPreviewDto,
  PostPlannerRerollDayDto,
  UpdatePostPlannerFormatDto,
  UpdatePostPlannerSlotDto,
} from './dto';

type PlannerPost = {
  id: string;
  title: string;
  groupId: string | null;
  groupPosition: number | null;
  createdAt: Date;
};

@Injectable()
export class TelegramPostCalendarPlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelsService: TelegramChannelsService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async channelContext(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true, workspaceId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    return {
      workspaceId,
      timezone: workspace?.timezone ?? 'Europe/Warsaw',
    };
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException('Planner timezone is invalid');
    }
  }

  private serializeFormat(format: TelegramPostPlannerFormat) {
    return {
      id: format.id,
      telegramChannelId: format.telegramChannelId,
      name: format.name,
      description: format.description,
      icon: format.icon,
      position: format.position,
      isActive: format.isActive,
    };
  }

  private serializeSlot(slot: TelegramPostPlannerSlot) {
    return {
      id: slot.id,
      telegramChannelId: slot.telegramChannelId,
      formatId: slot.formatId,
      postGroupIds: slot.postGroupIds,
      weekday: slot.weekday,
      time: slot.time,
      timezone: slot.timezone,
      position: slot.position,
      isActive: slot.isActive,
    };
  }

  async listFormats(userId: string, channelId: string) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    const formats = await this.prisma.telegramPostPlannerFormat.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return formats.map((format) => this.serializeFormat(format));
  }

  async createFormat(
    userId: string,
    channelId: string,
    dto: CreatePostPlannerFormatDto,
  ) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Format name is required');
    const created = await this.prisma.telegramPostPlannerFormat.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        name,
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.serializeFormat(created);
  }

  async updateFormat(
    userId: string,
    channelId: string,
    formatId: string,
    dto: UpdatePostPlannerFormatDto,
  ) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    await this.requireFormat(workspaceId, channelId, formatId);
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Format name is required');
    }
    const updated = await this.prisma.telegramPostPlannerFormat.update({
      where: { id: formatId },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        icon: dto.icon === undefined ? undefined : dto.icon?.trim() || null,
        position: dto.position,
        isActive: dto.isActive,
      },
    });
    return this.serializeFormat(updated);
  }

  async deleteFormat(userId: string, channelId: string, formatId: string) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    await this.requireFormat(workspaceId, channelId, formatId);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.telegramPostPlannerSlot.deleteMany({
        where: { workspaceId, telegramChannelId: channelId, formatId },
      });
      return tx.telegramPostPlannerFormat.delete({
        where: { id: formatId },
      });
    });
    return this.serializeFormat(deleted);
  }

  async listSlots(userId: string, channelId: string) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    const slots = await this.prisma.telegramPostPlannerSlot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: [{ weekday: 'asc' }, { position: 'asc' }, { time: 'asc' }],
    });
    return slots.map((slot) => this.serializeSlot(slot));
  }

  async createSlot(
    userId: string,
    channelId: string,
    dto: CreatePostPlannerSlotDto,
  ) {
    const { workspaceId, timezone: workspaceTimezone } =
      await this.channelContext(userId, channelId);
    const timezone = dto.timezone?.trim() || workspaceTimezone;
    this.assertTimezone(timezone);
    const postGroupIds = await this.validatedPostGroupIds(
      workspaceId,
      channelId,
      dto.postGroupIds ?? [],
    );
    const formatId = await this.validatedFormatId(
      workspaceId,
      channelId,
      dto.formatId,
    );
    const created = await this.prisma.telegramPostPlannerSlot.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        formatId,
        postGroupIds,
        weekday: dto.weekday,
        time: dto.time,
        timezone,
        position: dto.position ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return this.serializeSlot(created);
  }

  async updateSlot(
    userId: string,
    channelId: string,
    slotId: string,
    dto: UpdatePostPlannerSlotDto,
  ) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    const existing = await this.prisma.telegramPostPlannerSlot.findFirst({
      where: { id: slotId, workspaceId, telegramChannelId: channelId },
    });
    if (!existing) throw new NotFoundException('Planner slot not found');
    const timezone = dto.timezone?.trim();
    if (timezone) this.assertTimezone(timezone);
    const postGroupIds =
      dto.postGroupIds === undefined
        ? undefined
        : await this.validatedPostGroupIds(
            workspaceId,
            channelId,
            dto.postGroupIds,
          );
    const formatId =
      dto.formatId === undefined
        ? undefined
        : await this.validatedFormatId(workspaceId, channelId, dto.formatId);
    const updated = await this.prisma.telegramPostPlannerSlot.update({
      where: { id: slotId },
      data: {
        formatId,
        postGroupIds,
        weekday: dto.weekday,
        time: dto.time,
        timezone,
        position: dto.position,
        isActive: dto.isActive,
      },
    });
    return this.serializeSlot(updated);
  }

  async deleteSlot(userId: string, channelId: string, slotId: string) {
    const { workspaceId } = await this.channelContext(userId, channelId);
    const slot = await this.prisma.telegramPostPlannerSlot.findFirst({
      where: { id: slotId, workspaceId, telegramChannelId: channelId },
    });
    if (!slot) throw new NotFoundException('Planner slot not found');
    const deleted = await this.prisma.telegramPostPlannerSlot.delete({
      where: { id: slotId },
    });
    return this.serializeSlot(deleted);
  }

  async preview(
    userId: string,
    channelId: string,
    dto: PostPlannerPreviewDto,
  ): Promise<TelegramPostPlannerPreviewResult> {
    const { workspaceId, timezone: workspaceTimezone } =
      await this.channelContext(userId, channelId);
    return this.buildPreview(workspaceId, channelId, workspaceTimezone, dto);
  }

  async apply(
    userId: string,
    channelId: string,
    dto: PostPlannerApplyDto,
  ): Promise<TelegramPostPlannerApplyResult> {
    const { workspaceId, timezone: workspaceTimezone } =
      await this.channelContext(userId, channelId);
    const preview = await this.buildPreview(
      workspaceId,
      channelId,
      workspaceTimezone,
      dto,
    );
    if (!preview.assignments.length) {
      throw new BadRequestException('Planner produced no assignments');
    }
    const plannerRunId = randomUUID();
    const schedule = await this.telegramChannelsService.scheduleManagedPostsBatch(
      userId,
      channelId,
      {
        items: preview.assignments.map((assignment) => ({
          postId: assignment.postId,
          scheduledAt: assignment.scheduledAt,
        })),
      },
    );
    const successfulPostIds = new Set(
      schedule.results
        .filter((item) => item.success)
        .map((item) => item.postId)
        .filter((postId): postId is string => Boolean(postId)),
    );
    const generatedAt = new Date().toISOString();
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of preview.assignments) {
        if (!successfulPostIds.has(assignment.postId)) continue;
        const updated = await tx.telegramManagedPost.updateMany({
          where: {
            id: assignment.postId,
            workspaceId,
            telegramChannelId: channelId,
          },
          data: {
            plannerFormatId: assignment.formatId,
            plannerSlotId: assignment.slotId,
            plannerRunId,
            plannerPlannedAt: new Date(generatedAt),
            plannerProvenance: {
              ...assignment.provenance,
              generatedAt,
              plannerRunId,
            } satisfies Prisma.InputJsonObject,
          },
        });
        if (updated.count !== 1) {
          throw new NotFoundException('Scheduled planner post was not found');
        }
      }
    });
    return { plannerRunId, preview, schedule };
  }

  async rerollDay(
    userId: string,
    channelId: string,
    dto: PostPlannerRerollDayDto,
  ): Promise<TelegramPostPlannerApplyResult> {
    const { workspaceId, timezone: workspaceTimezone } =
      await this.channelContext(userId, channelId);
    const timezone = dto.timezone?.trim() || workspaceTimezone;
    this.assertTimezone(timezone);
    const day = this.dateKeyFromInput(dto.date, timezone);
    const dayStart = zonedDateTimeToUtc(day, '00:00', timezone);
    const nextDay = this.dateKeys(day, day)[0];
    const dayEndCursor = new Date(`${nextDay}T00:00:00.000Z`);
    dayEndCursor.setUTCDate(dayEndCursor.getUTCDate() + 1);
    const dayEnd = zonedDateTimeToUtc(
      dayEndCursor.toISOString().slice(0, 10),
      '00:00',
      timezone,
    );
    if (dayEnd.getTime() <= Date.now()) {
      throw new BadRequestException('Only future planner days can be rerolled');
    }
    const autoPosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
        plannerRunId: { not: null },
        plannerSlotId: { not: null },
        scheduledAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    for (const post of autoPosts) {
      await this.telegramChannelsService.returnManagedPostToDraft(
        userId,
        channelId,
        post.id,
      );
    }
    return this.apply(userId, channelId, {
      from: day,
      to: day,
      timezone,
      postGroupIds: dto.postGroupIds,
      formatIds: dto.formatIds,
      formatWeights: dto.formatWeights,
      limit: dto.limit,
      rerollOffset: (dto.rerollOffset ?? 0) + 1,
    });
  }

  private async buildPreview(
    workspaceId: string,
    channelId: string,
    workspaceTimezone: string,
    dto: PostPlannerPreviewDto,
  ): Promise<TelegramPostPlannerPreviewResult> {
    const timezone = dto.timezone?.trim() || workspaceTimezone;
    this.assertTimezone(timezone);
    const from = this.dateKeyFromInput(dto.from, timezone);
    const to = this.dateKeyFromInput(dto.to, timezone);
    if (to < from) throw new BadRequestException('Planner range is invalid');
    const dateKeys = this.dateKeys(from, to);
    if (dateKeys.length > 62) {
      throw new BadRequestException('Planner range is limited to 62 days');
    }
    const requestedGroupIds = await this.validatedPostGroupIds(
      workspaceId,
      channelId,
      dto.postGroupIds ?? [],
    );
    const formatWeights = this.validatedFormatWeights(dto.formatWeights);
    const weightedFormatIds = [...formatWeights.entries()]
      .filter(([, weight]) => weight > 0)
      .map(([formatId]) => formatId);
    if (formatWeights.size && !weightedFormatIds.length) {
      throw new BadRequestException(
        'At least one planner format frequency must be enabled',
      );
    }
    const formatIdInput = dto.formatIds?.length
      ? dto.formatIds
      : weightedFormatIds;
    const requestedFormatIds = (
      await this.validatedFormatIds(workspaceId, channelId, formatIdInput)
    ).filter((formatId) => (formatWeights.get(formatId) ?? 100) > 0);
    if (formatIdInput.length && !requestedFormatIds.length) {
      throw new BadRequestException(
        'At least one planner format frequency must be enabled',
      );
    }
    const slots = await this.loadMatchingSlots(
      workspaceId,
      channelId,
      dateKeys,
      requestedGroupIds,
      requestedFormatIds,
      timezone,
    );
    const scheduledAts = slots.map((slot) =>
      zonedDateTimeToUtc(slot.date, slot.time, slot.timezone),
    );
    const occupied = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { in: scheduledAts },
      },
      select: { scheduledAt: true },
    });
    const occupiedTimes = new Set(
      occupied
        .map((post) => post.scheduledAt?.toISOString() ?? null)
        .filter((value): value is string => Boolean(value)),
    );
    const availableSlots = this.orderSlotsByFormatWeights(
      slots
      .map((slot) => ({
        ...slot,
        scheduledAt: zonedDateTimeToUtc(slot.date, slot.time, slot.timezone),
      }))
      .filter((slot) => slot.scheduledAt.getTime() > Date.now())
      .filter((slot) => !occupiedTimes.has(slot.scheduledAt.toISOString()))
      .sort((left, right) => {
        const constraintDelta =
          this.slotConstraintScore(left) - this.slotConstraintScore(right);
        if (constraintDelta !== 0) return constraintDelta;
        const timeDelta =
          left.scheduledAt.getTime() - right.scheduledAt.getTime();
        if (timeDelta !== 0) return timeDelta;
        return left.position - right.position || left.id.localeCompare(right.id);
      }),
      formatWeights,
    );
    const posts = await this.loadEligiblePosts(
      workspaceId,
      channelId,
      requestedGroupIds,
      dto.limit ?? 50,
    );
    const remainingPosts = this.rotate(posts, dto.rerollOffset ?? 0);
    const assignments: TelegramPostPlannerAssignment[] = [];
    for (const slot of availableSlots) {
      const postIndex = this.pickPostForSlot(remainingPosts, slot);
      if (postIndex < 0) continue;
      const [post] = remainingPosts.splice(postIndex, 1);
      const generatedAt = new Date().toISOString();
      assignments.push({
        postId: post.id,
        title: post.title,
        scheduledAt: slot.scheduledAt.toISOString(),
        date: slot.date,
        slotId: slot.id,
        formatId: slot.formatId,
        groupId: post.groupId,
        provenance: {
          planner: 'telegram_posts_auto_calendar',
          reason: 'matched_active_slot',
          slotId: slot.id,
          formatId: slot.formatId,
          groupId: post.groupId,
          generatedAt,
        },
      });
      if (assignments.length >= (dto.limit ?? 50)) break;
    }
    assignments.sort((left, right) => {
      const timeDelta =
        new Date(left.scheduledAt).getTime() -
        new Date(right.scheduledAt).getTime();
      if (timeDelta !== 0) return timeDelta;
      return left.slotId.localeCompare(right.slotId);
    });
    return {
      from,
      to,
      timezone,
      assignments,
      summary: {
        eligiblePosts: posts.length,
        availableSlots: availableSlots.length,
        plannedPosts: assignments.length,
        unfilledSlots: Math.max(0, availableSlots.length - assignments.length),
      },
    };
  }

  private async requireFormat(
    workspaceId: string,
    channelId: string,
    formatId: string,
  ) {
    const format = await this.prisma.telegramPostPlannerFormat.findFirst({
      where: { id: formatId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!format) throw new NotFoundException('Planner format not found');
  }

  private async validatedFormatId(
    workspaceId: string,
    channelId: string,
    formatId?: string | null,
  ) {
    const trimmed = formatId?.trim() || null;
    if (!trimmed) return null;
    await this.requireFormat(workspaceId, channelId, trimmed);
    return trimmed;
  }

  private async validatedFormatIds(
    workspaceId: string,
    channelId: string,
    formatIds: string[],
  ) {
    const unique = [...new Set(formatIds.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) return [];
    const count = await this.prisma.telegramPostPlannerFormat.count({
      where: { id: { in: unique }, workspaceId, telegramChannelId: channelId },
    });
    if (count !== unique.length) {
      throw new NotFoundException('One or more planner formats were not found');
    }
    return unique;
  }

  private validatedFormatWeights(formatWeights?: Record<string, number>) {
    const entries = Object.entries(formatWeights ?? {});
    const normalized = new Map<string, number>();
    for (const [formatId, rawWeight] of entries) {
      const trimmedFormatId = formatId.trim();
      const weight = Number(rawWeight);
      if (!trimmedFormatId || !Number.isFinite(weight)) {
        throw new BadRequestException('Planner format frequency is invalid');
      }
      if (weight < 0 || weight > 100) {
        throw new BadRequestException(
          'Planner format frequency must be between 0 and 100',
        );
      }
      normalized.set(trimmedFormatId, weight);
    }
    return normalized;
  }

  private async validatedPostGroupIds(
    workspaceId: string,
    channelId: string,
    postGroupIds: string[],
  ) {
    const unique = [
      ...new Set(postGroupIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (!unique.length) return [];
    const count = await this.prisma.postGroup.count({
      where: { id: { in: unique }, workspaceId, telegramChannelId: channelId },
    });
    if (count !== unique.length) {
      throw new NotFoundException('One or more post groups were not found');
    }
    return unique;
  }

  private async loadEligiblePosts(
    workspaceId: string,
    channelId: string,
    postGroupIds: string[],
    limit: number,
  ): Promise<PlannerPost[]> {
    return this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        origin: 'SYSTEM',
        status: { in: [TelegramManagedPostStatus.DRAFT] },
        text: { not: null },
        ...(postGroupIds.length ? { groupId: { in: postGroupIds } } : {}),
      },
      select: {
        id: true,
        title: true,
        groupId: true,
        groupPosition: true,
        createdAt: true,
      },
      orderBy: [
        { groupPosition: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: limit,
    });
  }

  private async loadMatchingSlots(
    workspaceId: string,
    channelId: string,
    dateKeys: string[],
    postGroupIds: string[],
    formatIds: string[],
    timezone: string,
  ) {
    const weekdays = [...new Set(dateKeys.map((date) => this.weekday(date)))];
    const slots = await this.prisma.telegramPostPlannerSlot.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        isActive: true,
        OR: [{ weekday: { in: weekdays } }, { formatId: { not: null } }],
        ...(formatIds.length ? { formatId: { in: formatIds } } : {}),
      },
      orderBy: [{ weekday: 'asc' }, { position: 'asc' }, { time: 'asc' }],
    });
    return dateKeys.flatMap((date) =>
      slots
        .filter((slot) => slot.formatId != null || slot.weekday === this.weekday(date))
        .filter(
          (slot) =>
            !postGroupIds.length ||
            !slot.postGroupIds.length ||
            slot.postGroupIds.some((id) => postGroupIds.includes(id)),
        )
        .map((slot) => ({
          ...slot,
          date,
          timezone: slot.timezone || timezone,
        })),
    );
  }

  private postMatchesSlot(
    post: PlannerPost,
    slot: TelegramPostPlannerSlot & { date: string },
  ) {
    return (
      !slot.postGroupIds.length ||
      (post.groupId != null && slot.postGroupIds.includes(post.groupId))
    );
  }

  private slotConstraintScore(slot: TelegramPostPlannerSlot) {
    return slot.postGroupIds.length || Number.MAX_SAFE_INTEGER;
  }

  private orderSlotsByFormatWeights<
    T extends TelegramPostPlannerSlot & { scheduledAt: Date },
  >(slots: T[], formatWeights: Map<string, number>) {
    if (!formatWeights.size) return slots;
    const slotsByFormat = new Map<string, T[]>();
    const unformattedSlots: T[] = [];
    for (const slot of slots) {
      if (!slot.formatId) {
        unformattedSlots.push(slot);
        continue;
      }
      const weight = formatWeights.get(slot.formatId) ?? 100;
      if (weight <= 0) continue;
      const current = slotsByFormat.get(slot.formatId) ?? [];
      current.push(slot);
      slotsByFormat.set(slot.formatId, current);
    }
    const entries = [...slotsByFormat.entries()].map(([formatId, items]) => ({
      formatId,
      weight: formatWeights.get(formatId) ?? 100,
      items,
    }));
    if (!entries.length) return unformattedSlots;
    const weightedQueue = entries.flatMap((entry) =>
      Array.from(
        { length: Math.max(1, Math.round(entry.weight / 10)) },
        () => entry,
      ),
    );
    const ordered: T[] = [];
    let guard = 0;
    while (entries.some((entry) => entry.items.length) && guard < 10000) {
      const entry = weightedQueue[guard % weightedQueue.length];
      const next = entry.items.shift();
      if (next) ordered.push(next);
      guard += 1;
    }
    return [...ordered, ...unformattedSlots];
  }

  private pickPostForSlot(
    posts: PlannerPost[],
    slot: TelegramPostPlannerSlot & { date: string },
  ) {
    return posts.findIndex((post) => this.postMatchesSlot(post, slot));
  }

  private dateKeyFromInput(value: string, timezone: string) {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Planner date is invalid');
    }
    return utcDateKey(parsed, timezone);
  }

  private dateKeys(from: string, to: string) {
    const dates: string[] = [];
    let cursor = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
    return dates;
  }

  private weekday(dateKey: string) {
    return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  }

  private rotate<T>(items: T[], offset: number) {
    if (!items.length) return [];
    const normalized = offset % items.length;
    return [...items.slice(normalized), ...items.slice(0, normalized)];
  }
}
