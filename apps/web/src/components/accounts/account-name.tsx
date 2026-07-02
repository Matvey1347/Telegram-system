'use client';

import type { Account } from '@/lib/api';
import { IconAvatar } from '@/components/icons/icon-avatar';

export function AccountName({
  account,
  fallback = '-',
  className = '',
}: {
  account?: Pick<Account, 'name' | 'assignedMember'> | null;
  fallback?: string;
  className?: string;
}) {
  if (!account) return <span className={className}>{fallback}</span>;
  const member = account.assignedMember;

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      <span className="truncate">{account.name}</span>
      {member ? (
        <span className="inline-flex shrink-0 items-center gap-1 align-middle text-sm font-medium leading-none text-neutral-300">
          <span className="text-neutral-500" aria-hidden="true">(</span>
          <IconAvatar
            icon={member.avatarIcon}
            label={member.user.name}
            size="xs"
            className="!h-6 !w-6 !rounded-full text-xs"
          />
          <span className="max-w-32 truncate">{member.user.name}</span>
          <span className="text-neutral-500" aria-hidden="true">)</span>
        </span>
      ) : null}
    </span>
  );
}
