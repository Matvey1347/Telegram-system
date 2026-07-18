export type ParsedTelegramPostUrl =
  | { kind: 'public'; username: string; messageId: string }
  | { kind: 'private'; chatId: string; messageId: string };

export function normalizeTelegramChannelId(
  telegramChatId: string | null | undefined,
) {
  const raw = String(telegramChatId || '').trim();
  if (!raw) return null;
  const withoutPrefix = raw.startsWith('-100') ? raw.slice(4) : raw;
  const normalized = withoutPrefix.startsWith('-')
    ? withoutPrefix.slice(1)
    : withoutPrefix;
  return /^\d+$/.test(normalized) ? normalized : null;
}

export function buildStableTelegramPostUrl(params: {
  telegramChatId: string | null | undefined;
  messageId: string | null | undefined;
}) {
  const chatId = normalizeTelegramChannelId(params.telegramChatId);
  const messageId = String(params.messageId || '').trim();
  if (!chatId || !/^\d+$/.test(messageId)) return null;
  return `https://t.me/c/${chatId}/${messageId}`;
}

export function parseTelegramPostUrl(
  value: string,
): ParsedTelegramPostUrl | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 't.me') {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'c' && parts.length === 3) {
    return /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])
      ? { kind: 'private', chatId: parts[1], messageId: parts[2] }
      : null;
  }
  if (
    parts.length === 2 &&
    /^[a-zA-Z0-9_]{5,}$/.test(parts[0]) &&
    /^\d+$/.test(parts[1])
  ) {
    return {
      kind: 'public',
      username: parts[0].toLowerCase(),
      messageId: parts[1],
    };
  }
  return null;
}
