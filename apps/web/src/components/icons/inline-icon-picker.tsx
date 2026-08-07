'use client';

import type { Icon, ResolvedEmoji } from '@/lib/api';
import { IconPicker } from './icon-picker';

type InlineIconPickerProps = {
  iconId?: string | null;
  icon?: Icon | ResolvedEmoji | null;
  onChange: (iconId: string | null) => void;
  className?: string;
};

export function InlineIconPicker({
  iconId,
  icon,
  onChange,
  className = '',
}: InlineIconPickerProps) {
  if (!iconId && !icon) return null;

  return (
    <IconPicker
      compact
      bare
      iconId={iconId}
      icon={icon}
      onChange={onChange}
      className={`cursor-pointer ${className}`.trim()}
    />
  );
}
