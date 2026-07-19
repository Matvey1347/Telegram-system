function toCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inviteLinkAttributedSubscribers(link: {
  joinedCount?: unknown;
  requestedCount?: unknown;
} | null | undefined) {
  return toCount(link?.joinedCount) + toCount(link?.requestedCount);
}

export function sumInviteLinkAttributedSubscribers(
  links: Array<{
    joinedCount?: unknown;
    requestedCount?: unknown;
  } | null | undefined>,
) {
  return links.reduce(
    (sum, link) => sum + inviteLinkAttributedSubscribers(link),
    0,
  );
}
