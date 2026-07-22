function toCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inviteLinkJoinedSubscribers(link: {
  joinedCount?: unknown;
  requestedCount?: unknown;
} | null | undefined) {
  return toCount(link?.joinedCount);
}

export function sumInviteLinkJoinedSubscribers(
  links: Array<{
    joinedCount?: unknown;
    requestedCount?: unknown;
  } | null | undefined>,
) {
  return links.reduce(
    (sum, link) => sum + inviteLinkJoinedSubscribers(link),
    0,
  );
}

export function inviteLinkAttributedSubscribers(link: {
  joinedCount?: unknown;
  requestedCount?: unknown;
} | null | undefined) {
  return inviteLinkJoinedSubscribers(link) + toCount(link?.requestedCount);
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
