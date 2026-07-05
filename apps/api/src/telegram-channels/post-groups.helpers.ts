import { BadRequestException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import type { BulkActionResultItem } from '@telegram-system/shared';

export type PostGroupStatusSummary = {
  totalPosts: number;
  draftCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  computedStatus:
    | 'EMPTY'
    | 'HAS_ERRORS'
    | 'ALL_DRAFT'
    | 'ALL_SCHEDULED'
    | 'ALL_PUBLISHED'
    | 'MIXED';
};

export function postGroupStatusSummary(
  statuses: TelegramManagedPostStatus[],
): PostGroupStatusSummary {
  const draftCount = statuses.filter(
    (status) => status === TelegramManagedPostStatus.DRAFT,
  ).length;
  const scheduledCount = statuses.filter(
    (status) => status === TelegramManagedPostStatus.SCHEDULED,
  ).length;
  const publishedCount = statuses.filter(
    (status) => status === TelegramManagedPostStatus.PUBLISHED,
  ).length;
  const failedCount = statuses.filter(
    (status) => status === TelegramManagedPostStatus.FAILED,
  ).length;
  const totalPosts = statuses.length;

  let computedStatus: PostGroupStatusSummary['computedStatus'] = 'MIXED';
  if (totalPosts === 0) computedStatus = 'EMPTY';
  else if (failedCount > 0) computedStatus = 'HAS_ERRORS';
  else if (draftCount === totalPosts) computedStatus = 'ALL_DRAFT';
  else if (scheduledCount === totalPosts) computedStatus = 'ALL_SCHEDULED';
  else if (publishedCount === totalPosts) computedStatus = 'ALL_PUBLISHED';

  return {
    totalPosts,
    draftCount,
    scheduledCount,
    publishedCount,
    failedCount,
    computedStatus,
  };
}

export function validateCompletePostOrder(
  currentPostIds: string[],
  orderedPostIds: string[],
) {
  if (
    new Set(orderedPostIds).size !== orderedPostIds.length ||
    currentPostIds.length !== orderedPostIds.length
  ) {
    throw new BadRequestException(
      'orderedPostIds must contain every group post exactly once',
    );
  }
  const current = new Set(currentPostIds);
  if (orderedPostIds.some((postId) => !current.has(postId))) {
    throw new BadRequestException(
      'orderedPostIds must contain every group post exactly once',
    );
  }
}

export function movedPostState(status: TelegramManagedPostStatus) {
  switch (status) {
    case TelegramManagedPostStatus.DRAFT:
      return {
        status: TelegramManagedPostStatus.DRAFT,
        action: 'MOVED_DRAFT' as const,
      };
    case TelegramManagedPostStatus.PUBLISHED:
      return {
        status: TelegramManagedPostStatus.DRAFT,
        action: 'RESET_PUBLISHED_TO_DRAFT' as const,
      };
    case TelegramManagedPostStatus.SCHEDULED:
      return {
        status: TelegramManagedPostStatus.DRAFT,
        action: 'RESCHEDULED' as const,
      };
    case TelegramManagedPostStatus.FAILED:
    case TelegramManagedPostStatus.PUBLISHING:
      return {
        status: TelegramManagedPostStatus.DRAFT,
        action: 'RESET_FAILED_TO_DRAFT' as const,
      };
  }
}

export function movedPostDatabaseState(
  status: TelegramManagedPostStatus,
  scheduledAt: Date | null,
  keepGroup: boolean,
  cancellationError: string | null,
) {
  return {
    status: cancellationError
      ? TelegramManagedPostStatus.FAILED
      : movedPostState(status).status,
    publishedAt: null,
    scheduledAt:
      status === TelegramManagedPostStatus.SCHEDULED ? scheduledAt : null,
    telegramMessageIds: [] as string[],
    telegramMessageUrls: [] as string[],
    sourceType: null,
    sourceId: null,
    lastError: cancellationError,
    groupId: keepGroup ? undefined : null,
    groupPosition: keepGroup ? undefined : null,
  };
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone = 'UTC',
) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new BadRequestException('Invalid schedule date or time');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException('Invalid IANA timezone');
  }
  const intended = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const calendarCheck = new Date(
    Date.UTC(intended.year, intended.month - 1, intended.day),
  );
  if (
    calendarCheck.getUTCFullYear() !== intended.year ||
    calendarCheck.getUTCMonth() + 1 !== intended.month ||
    calendarCheck.getUTCDate() !== intended.day
  ) {
    throw new BadRequestException('Invalid schedule date');
  }
  const intendedUtc = Date.UTC(
    intended.year,
    intended.month - 1,
    intended.day,
    intended.hour,
    intended.minute,
  );
  let result = new Date(intendedUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = zonedParts(result, timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    result = new Date(result.getTime() + intendedUtc - actualAsUtc);
  }
  const resolved = zonedParts(result, timezone);
  if (
    resolved.year !== intended.year ||
    resolved.month !== intended.month ||
    resolved.day !== intended.day ||
    resolved.hour !== intended.hour ||
    resolved.minute !== intended.minute
  ) {
    throw new BadRequestException(
      'Schedule time does not exist in the selected timezone',
    );
  }
  return result;
}

export function scheduleSequenceDates(
  startDate: string,
  time: string,
  intervalDays: number,
  count: number,
  timezone = 'UTC',
) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new BadRequestException('intervalDays must be at least 1');
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (!match) throw new BadRequestException('Invalid startDate');
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]) + intervalDays * index,
      ),
    );
    const localDate = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
    return zonedDateTimeToUtc(localDate, time, timezone);
  });
}

export function bulkActionCounts(results: BulkActionResultItem[]) {
  return {
    total: results.length,
    successCount: results.filter((result) => result.success && !result.skipped)
      .length,
    failedCount: results.filter((result) => !result.success && !result.skipped)
      .length,
    skippedCount: results.filter((result) => result.skipped).length,
  };
}

export function publishGroupPostSkipReason(
  status: TelegramManagedPostStatus,
  options: {
    includeScheduled: boolean;
    includeFailed: boolean;
    republishPublished: boolean;
  },
) {
  if (
    status === TelegramManagedPostStatus.PUBLISHED &&
    !options.republishPublished
  )
    return 'already published';
  if (
    status === TelegramManagedPostStatus.SCHEDULED &&
    !options.includeScheduled
  )
    return 'scheduled posts are excluded';
  if (status === TelegramManagedPostStatus.FAILED && !options.includeFailed)
    return 'failed posts are excluded';
  if (status === TelegramManagedPostStatus.PUBLISHING)
    return 'publishing is in progress';
  return null;
}

export function scheduleGroupPostSkipReason(
  status: TelegramManagedPostStatus,
  options: {
    includeDraftsOnly: boolean;
    overwriteExistingScheduled: boolean;
    includeFailed: boolean;
  },
) {
  if (status === TelegramManagedPostStatus.DRAFT) return null;
  if (status === TelegramManagedPostStatus.PUBLISHED)
    return 'published posts cannot be scheduled';
  if (options.includeDraftsOnly) return 'only draft posts are included';
  if (status === TelegramManagedPostStatus.SCHEDULED)
    return options.overwriteExistingScheduled ? null : 'already scheduled';
  if (status === TelegramManagedPostStatus.FAILED)
    return options.includeFailed ? null : 'failed posts are excluded';
  return 'publishing is in progress';
}
