import type { TelegramManagedPost } from "@/lib/api";

type NextGroupedPostNumberOptions = {
  groupId: string | null;
  posts: TelegramManagedPost[];
  pendingGroupPostCount?: number;
};

export function buildAutoGroupedPostTitle(
  nextNumber: number | null,
): string {
  return nextNumber && nextNumber > 0 ? `${nextNumber}) ` : "";
}

export function getNextGroupedPostNumber({
  groupId,
  posts,
  pendingGroupPostCount = 0,
}: NextGroupedPostNumberOptions): number | null {
  if (!groupId) return null;
  const existingCount = posts.filter((post) => post.groupId === groupId).length;
  return existingCount + pendingGroupPostCount + 1;
}
