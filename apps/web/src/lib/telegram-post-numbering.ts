import type { TelegramManagedPost } from "@/lib/api";

type NumberingBucket = "DRAFT" | "SCHEDULED" | "PUBLISHED";

function numberingBucket(
  status: TelegramManagedPost["status"],
): NumberingBucket {
  if (status === "SCHEDULED") return "SCHEDULED";
  if (status === "PUBLISHED") return "PUBLISHED";
  return "DRAFT";
}

export function getManagedPostDisplayNumber(
  post: Pick<TelegramManagedPost, "groupPosition" | "statusPosition">,
  useStatusNumbering: boolean,
) {
  const position = useStatusNumbering
    ? post.statusPosition
    : post.groupPosition;
  return typeof position === "number" ? position + 1 : null;
}

export function normalizeManagedPostNumbering<T extends TelegramManagedPost>(
  posts: T[],
): T[] {
  const counters: Record<NumberingBucket, number> = {
    DRAFT: 0,
    SCHEDULED: 0,
    PUBLISHED: 0,
  };
  return [...posts]
    .sort(
      (left, right) =>
        (left.groupPosition ?? Number.MAX_SAFE_INTEGER) -
          (right.groupPosition ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .map((post, groupPosition) => {
      const bucket = numberingBucket(post.status);
      const statusPosition = counters[bucket];
      counters[bucket] += 1;
      return { ...post, groupPosition, statusPosition };
    });
}
