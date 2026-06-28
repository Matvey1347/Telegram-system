'use client';

import type { WorkspaceMember } from '@/lib/api';
import { IconAvatar } from '@/components/icons/icon-avatar';

export function MemberBadge({
  member,
  compact = false,
}: {
  member?: WorkspaceMember | null;
  compact?: boolean;
}) {
  if (!member) {
    return <span className="text-xs text-neutral-500">Unassigned</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-neutral-200">
      <IconAvatar icon={member.avatarIcon} label={member.user.name} size="xs" />
      {!compact && <span className="truncate">{member.user.name}</span>}
    </span>
  );
}
