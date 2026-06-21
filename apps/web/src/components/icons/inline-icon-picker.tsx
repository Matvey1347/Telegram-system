'use client';

import { IconPicker } from './icon-picker';

type InlineIconPickerProps = {
  iconId?: string | null;
  onChange: (iconId: string | null) => void;
  className?: string;
};

export function InlineIconPicker({
  iconId,
  onChange,
  className = '',
}: InlineIconPickerProps) {
  if (!iconId) return null;

  return (
    <IconPicker
      compact
      bare
      iconId={iconId}
      onChange={onChange}
      className={`cursor-pointer ${className}`.trim()}
    />
  );
}
