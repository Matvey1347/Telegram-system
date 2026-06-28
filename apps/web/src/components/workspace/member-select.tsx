'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui/primitives';
import { workspaceMembersApi } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

export function MemberSelect({
  value,
  onChange,
  includeAll = false,
  defaultToCurrent = false,
  disabled,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  includeAll?: boolean;
  defaultToCurrent?: boolean;
  disabled?: boolean;
}) {
  const { workspace } = useAuth();
  const members = useQuery({
    queryKey: ['workspace-members'],
    queryFn: workspaceMembersApi.list,
  });
  const current = members.data?.find((member) => member.isCurrentUser);
  const canAssignOthers =
    workspace?.role === 'owner' || workspace?.role === 'admin';

  useEffect(() => {
    if (defaultToCurrent && !value && current?.id) onChange(current.id);
  }, [current?.id, defaultToCurrent, onChange, value]);

  return (
    <Select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || members.isLoading || !canAssignOthers}
    >
      {includeAll && <option value="">All</option>}
      {!includeAll && canAssignOthers && <option value="">Unassigned</option>}
      {members.data?.map((member) => (
        <option
          key={member.id}
          value={member.id}
          data-icon-url={member.avatarIcon?.imageUrl ?? undefined}
          data-icon-emoji={member.avatarIcon?.emoji ?? undefined}
          data-icon-fallback={member.user.name}
        >
          {member.user.name}
        </option>
      ))}
    </Select>
  );
}
