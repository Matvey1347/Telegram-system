import { BadRequestException } from '@nestjs/common';
import { TelegramManagedPostStatus } from '@prisma/client';
import {
  bulkActionCounts,
  movedPostDatabaseState,
  movedPostState,
  postGroupStatusSummary,
  publishGroupPostSkipReason,
  scheduleGroupPostSkipReason,
  scheduleSequenceDates,
  validateCompletePostOrder,
} from './post-groups.helpers';

describe('post group helpers', () => {
  it.each([
    [[], 'EMPTY'],
    [[TelegramManagedPostStatus.DRAFT], 'ALL_DRAFT'],
    [[TelegramManagedPostStatus.SCHEDULED], 'ALL_SCHEDULED'],
    [[TelegramManagedPostStatus.PUBLISHED], 'ALL_PUBLISHED'],
    [
      [TelegramManagedPostStatus.DRAFT, TelegramManagedPostStatus.FAILED],
      'HAS_ERRORS',
    ],
    [
      [TelegramManagedPostStatus.DRAFT, TelegramManagedPostStatus.PUBLISHED],
      'MIXED',
    ],
  ] as const)('computes group status for %j', (statuses, expected) => {
    expect(postGroupStatusSummary([...statuses]).computedStatus).toBe(expected);
  });

  it('accepts a complete reordered post id set', () => {
    expect(() =>
      validateCompletePostOrder(['a', 'b', 'c'], ['c', 'a', 'b']),
    ).not.toThrow();
  });

  it.each([
    [['a', 'b'], ['a']],
    [
      ['a', 'b'],
      ['a', 'a'],
    ],
    [
      ['a', 'b'],
      ['a', 'c'],
    ],
  ])('rejects incomplete or invalid reorder input', (current, ordered) => {
    expect(() => validateCompletePostOrder(current, ordered)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    [TelegramManagedPostStatus.DRAFT, TelegramManagedPostStatus.DRAFT],
    [TelegramManagedPostStatus.PUBLISHED, TelegramManagedPostStatus.DRAFT],
    [TelegramManagedPostStatus.SCHEDULED, TelegramManagedPostStatus.DRAFT],
    [TelegramManagedPostStatus.FAILED, TelegramManagedPostStatus.DRAFT],
  ])('maps %s to its move staging status', (status, expected) => {
    expect(movedPostState(status).status).toBe(expected);
  });

  it('keeps scheduledAt and clears old Telegram ids while staging a move', () => {
    const scheduledAt = new Date('2026-07-09T08:00:00.000Z');
    expect(
      movedPostDatabaseState(
        TelegramManagedPostStatus.SCHEDULED,
        scheduledAt,
        false,
        null,
      ),
    ).toMatchObject({
      status: TelegramManagedPostStatus.DRAFT,
      scheduledAt,
      telegramMessageIds: [],
      sourceType: null,
      sourceId: null,
      groupId: null,
      groupPosition: null,
    });
  });

  it('calculates sequence dates in group order with a two-day interval', () => {
    expect(
      scheduleSequenceDates('2026-07-07', '10:00', 2, 3, 'Europe/Warsaw').map(
        (date) => date.toISOString(),
      ),
    ).toEqual([
      '2026-07-07T08:00:00.000Z',
      '2026-07-09T08:00:00.000Z',
      '2026-07-11T08:00:00.000Z',
    ]);
  });

  it('applies publish-all defaults without duplicating published posts', () => {
    const options = {
      includeScheduled: true,
      includeFailed: true,
      republishPublished: false,
    };
    expect(
      publishGroupPostSkipReason(TelegramManagedPostStatus.DRAFT, options),
    ).toBeNull();
    expect(
      publishGroupPostSkipReason(TelegramManagedPostStatus.SCHEDULED, options),
    ).toBeNull();
    expect(
      publishGroupPostSkipReason(TelegramManagedPostStatus.PUBLISHED, options),
    ).toBe('already published');
  });

  it('skips published and existing scheduled posts by schedule defaults', () => {
    const options = {
      includeDraftsOnly: false,
      overwriteExistingScheduled: false,
      includeFailed: true,
    };
    expect(
      scheduleGroupPostSkipReason(TelegramManagedPostStatus.DRAFT, options),
    ).toBeNull();
    expect(
      scheduleGroupPostSkipReason(TelegramManagedPostStatus.PUBLISHED, options),
    ).toBe('published posts cannot be scheduled');
    expect(
      scheduleGroupPostSkipReason(TelegramManagedPostStatus.SCHEDULED, options),
    ).toBe('already scheduled');
  });

  it('counts successful, failed, and skipped result items consistently', () => {
    const base = {
      postId: 'post',
      index: 1,
      total: 3,
      action: 'PUBLISHED' as const,
    };
    expect(
      bulkActionCounts([
        { ...base, success: true },
        { ...base, postId: 'failed', success: false, action: 'FAILED' },
        {
          ...base,
          postId: 'skipped',
          success: false,
          skipped: true,
          action: 'SKIPPED',
        },
      ]),
    ).toEqual({
      total: 3,
      successCount: 1,
      failedCount: 1,
      skippedCount: 1,
    });
  });
});
