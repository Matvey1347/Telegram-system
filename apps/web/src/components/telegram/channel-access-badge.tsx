import type { TelegramChannelAccessMode } from "@telegram-system/shared";

export function telegramChannelAccessLabel(
  accessMode?: TelegramChannelAccessMode | null,
) {
  switch (accessMode) {
    case "PUBLIC":
      return "Public";
    case "PRIVATE_JOIN_REQUEST":
      return "Private · Join requests";
    case "PRIVATE":
    case "PRIVATE_INVITE":
      return "Private";
    default:
      return "Unknown";
  }
}

export function telegramChannelAccessBadgeClass(
  accessMode?: TelegramChannelAccessMode | null,
) {
  switch (accessMode) {
    case "PUBLIC":
      return "border-emerald-700/70 text-emerald-200";
    case "PRIVATE_JOIN_REQUEST":
      return "border-amber-700/70 text-amber-200";
    case "PRIVATE":
    case "PRIVATE_INVITE":
      return "border-sky-700/70 text-sky-200";
    default:
      return "border-slate-700 text-slate-300";
  }
}

export function ChannelAccessBadge({
  accessMode,
  className = "",
}: {
  accessMode?: TelegramChannelAccessMode | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${telegramChannelAccessBadgeClass(accessMode)} ${className}`.trim()}
    >
      {telegramChannelAccessLabel(accessMode)}
    </span>
  );
}
