import type { Account } from '@/lib/api';

export function accountDisplayName(
  account?: Pick<Account, 'name' | 'assignedMember'> | null,
  fallback = '-',
) {
  if (!account) return fallback;
  const memberName = account.assignedMember?.user?.name?.trim();
  return memberName ? `${account.name} (${memberName})` : account.name;
}
