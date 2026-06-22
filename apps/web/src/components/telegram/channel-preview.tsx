import { TelegramEntityAvatar } from '@/components/telegram/telegram-entity-avatar';

type ChannelPreviewProps = {
  channel: any;
  rightAction?: React.ReactNode;
  subtitle?: string;
  avatarKind?: 'channel' | 'mtproto' | 'person';
  className?: string;
};

export function ChannelPreview({ channel, rightAction, subtitle, avatarKind = 'channel', className = '' }: ChannelPreviewProps) {
  const title = String(channel?.title || '-');
  const subscribers = channel?.currentSubscribersCount == null ? null : Number(channel.currentSubscribersCount);
  const fallbackSubtitle =
    subscribers != null && Number.isFinite(subscribers)
      ? `${subscribers.toLocaleString('en-US').replace(/,/g, ' ')} subscribers`
      : channel?.username
        ? `@${String(channel.username).replace(/^@/, '')}`
        : channel?.telegramChatId
          ? `ID ${channel.telegramChatId}`
          : '';
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-slate-900/70 p-3 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TelegramEntityAvatar imageUrl={channel?.photoUrl} kind={avatarKind} alt={title} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-none text-white">{title}</p>
          {subtitle || fallbackSubtitle ? <p className="mt-1 truncate text-sm text-slate-300">{subtitle || fallbackSubtitle}</p> : null}
        </div>
      </div>
      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </div>
  );
}
