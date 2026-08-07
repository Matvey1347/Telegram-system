'use client';

import type { Icon, ResolvedEmoji } from '@/lib/api';
import { iconToResolvedEmoji } from '@/lib/resolved-emoji';

const sizes = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
} as const;

const emojiSizes = {
  xs: 'text-sm',
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
} as const;

export function IconAvatar({
  icon,
  label,
  size = 'sm',
  className = '',
  bordered = true,
}: {
  icon?: Icon | ResolvedEmoji | null;
  label?: string;
  size?: keyof typeof sizes;
  className?: string;
  bordered?: boolean;
}) {
  const resolved = iconToResolvedEmoji(icon);
  const hasEmoji = resolved?.type === 'unicode';
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${
    bordered && !hasEmoji ? 'border border-neutral-700 bg-neutral-800' : 'bg-neutral-800'
  } text-white ${sizes[size]} ${className}`;

  if (resolved?.type === 'image') {
    return <img src={resolved.url} alt="" className={`${base} object-cover`} />;
  }

  if (resolved?.type === 'unicode') {
    return <span className={`${base} ${emojiSizes[size]}`}>{resolved.value}</span>;
  }

  const fallback = (label?.trim()?.[0] || '·').toUpperCase();
  return <span className={base}>{fallback}</span>;
}
