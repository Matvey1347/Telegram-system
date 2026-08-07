import type { ResolvedEmoji } from '@telegram-system/shared';

export type ResolvedEmojiIconSource = {
  id: string;
  type: 'emoji' | 'image';
  name?: string | null;
  emoji?: string | null;
  imageUrl?: string | null;
};

export function iconToResolvedEmoji(
  icon?: ResolvedEmojiIconSource | null,
): ResolvedEmoji | null {
  if (!icon) return null;

  if (icon.type === 'emoji' && icon.emoji) {
    return {
      type: 'unicode',
      value: icon.emoji,
      name: icon.name ?? null,
    };
  }

  if (icon.type === 'image' && icon.imageUrl) {
    return {
      type: 'image',
      id: icon.id,
      url: icon.imageUrl,
      name: icon.name ?? null,
    };
  }

  return null;
}
