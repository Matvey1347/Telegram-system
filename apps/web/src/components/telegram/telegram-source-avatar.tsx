'use client';

import { TelegramEntityAvatar } from '@/components/telegram/telegram-entity-avatar';

type TelegramSourceAvatarProps = {
  avatarUrl?: string | null;
  sourceType?: string | null;
  alt?: string;
  size?: 'sm' | 'md';
};

function sourceKind(sourceType?: string | null) {
  const normalizedType = String(sourceType || '').toUpperCase();
  if (normalizedType === 'BOT') return 'bot';
  if (normalizedType === 'MTPROTO') return 'mtproto';
  return 'person';
}

export function TelegramSourceAvatar({ avatarUrl, sourceType, alt = '', size = 'sm' }: TelegramSourceAvatarProps) {
  return <TelegramEntityAvatar imageUrl={avatarUrl} kind={sourceKind(sourceType)} alt={alt} size={size} />;
}
