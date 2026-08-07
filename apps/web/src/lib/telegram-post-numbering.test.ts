import { describe, expect, it } from "vitest";
import {
  getManagedPostDisplayNumber,
  normalizeManagedPostNumbering,
} from "@/lib/telegram-post-numbering";
import type { TelegramManagedPost } from "@/lib/api";

describe("telegram-post-numbering", () => {
  it("uses global group numbering when status numbering is off", () => {
    expect(
      getManagedPostDisplayNumber(
        { groupPosition: 11, statusPosition: 2 },
        false,
      ),
    ).toBe(12);
  });

  it("uses status bucket numbering when status numbering is on", () => {
    expect(
      getManagedPostDisplayNumber(
        { groupPosition: 11, statusPosition: 2 },
        true,
      ),
    ).toBe(3);
  });

  it("returns null for ungrouped or not-yet-canonical posts", () => {
    expect(
      getManagedPostDisplayNumber(
        { groupPosition: null, statusPosition: null },
        false,
      ),
    ).toBeNull();
  });

  it("keeps global gaps visible under status filters", () => {
    const draftRows = [
      { groupPosition: 0, statusPosition: 0 },
      { groupPosition: 2, statusPosition: 1 },
      { groupPosition: 4, statusPosition: 2 },
    ];

    expect(
      draftRows.map((post) => getManagedPostDisplayNumber(post, false)),
    ).toEqual([1, 3, 5]);
    expect(
      draftRows.map((post) => getManagedPostDisplayNumber(post, true)),
    ).toEqual([1, 2, 3]);
  });

  it("normalizes optimistic reordered posts by status bucket", () => {
    const normalized = normalizeManagedPostNumbering([
      {
        id: "published",
        status: "PUBLISHED",
        groupPosition: 2,
        statusPosition: 0,
        createdAt: "2026-08-01T10:02:00.000Z",
      },
      {
        id: "draft-b",
        status: "DRAFT",
        groupPosition: 0,
        statusPosition: 1,
        createdAt: "2026-08-01T10:01:00.000Z",
      },
      {
        id: "draft-a",
        status: "FAILED",
        groupPosition: 1,
        statusPosition: 0,
        createdAt: "2026-08-01T10:00:00.000Z",
      },
    ] as unknown as TelegramManagedPost[]);

    expect(
      normalized.map((post) => [
        post.id,
        post.groupPosition,
        post.statusPosition,
      ]),
    ).toEqual([
      ["draft-b", 0, 0],
      ["draft-a", 1, 1],
      ["published", 2, 0],
    ]);
  });
});
