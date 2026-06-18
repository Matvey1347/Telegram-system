'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import { Bot, RadioTower, Smartphone, UserRound } from 'lucide-react';

type TelegramEntityAvatarProps = {
  imageUrl?: string | null;
  kind?: 'channel' | 'mtproto' | 'person' | 'bot';
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeConfig = {
  sm: { box: 'h-8 w-8', icon: 14, label: 'text-[7px]' },
  md: { box: 'h-11 w-11', icon: 20, label: 'text-[9px]' },
  lg: { box: 'h-14 w-14', icon: 22, label: 'text-[9px]' },
};

const kindConfig = {
  channel: { icon: RadioTower, label: 'CH', tone: 'text-sky-300' },
  mtproto: { icon: Smartphone, label: 'MTP', tone: 'text-violet-300' },
  person: { icon: UserRound, label: 'USER', tone: 'text-emerald-300' },
  bot: { icon: Bot, label: 'BOT', tone: 'text-blue-300' },
};

export function TelegramEntityAvatar({ imageUrl, kind = 'person', alt = '', size = 'sm' }: TelegramEntityAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedUrl = typeof imageUrl === 'string' && imageUrl.trim() ? imageUrl.trim() : null;
  const dimensions = sizeConfig[size];
  const config = kindConfig[kind];
  const Icon = config.icon;

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedUrl]);

  const onImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
      setImageFailed(true);
    }
  };

  return (
    <div className={`relative ${dimensions.box} shrink-0 overflow-hidden rounded-full border border-slate-700 bg-slate-950`}>
      <div className={`absolute inset-0 flex flex-col items-center justify-center ${config.tone}`}>
        <Icon size={dimensions.icon} />
        <span className={`${dimensions.label} font-semibold leading-none tracking-wide`}>{config.label}</span>
      </div>
      {normalizedUrl && !imageFailed ? (
        <img
          src={normalizedUrl}
          alt={alt}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
          onLoad={onImageLoad}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </div>
  );
}
