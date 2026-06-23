'use client';

import type { Icon } from '@/lib/api';

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
  icon?: Icon | null;
  label?: string;
  size?: keyof typeof sizes;
  className?: string;
  bordered?: boolean;
}) {
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${bordered ? 'border border-neutral-700 bg-neutral-800' : 'bg-neutral-800'} text-white ${sizes[size]} ${className}`;

  if (icon?.imageUrl) {
    return <img src={icon.imageUrl} alt="" className={`${base} object-cover`} />;
  }

  if (icon?.emoji) {
    return <span className={`${base} ${emojiSizes[size]}`}>{icon.emoji}</span>;
  }

  const fallback = (label?.trim()?.[0] || '·').toUpperCase();
  return <span className={base}>{fallback}</span>;
}
