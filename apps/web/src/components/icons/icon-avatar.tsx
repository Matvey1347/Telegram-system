'use client';

import type { Icon } from '@/lib/api';

const sizes = {
  xs: 'h-5 w-5 text-[11px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
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
    return <span className={base}>{icon.emoji}</span>;
  }

  const fallback = (label?.trim()?.[0] || '·').toUpperCase();
  return <span className={base}>{fallback}</span>;
}
