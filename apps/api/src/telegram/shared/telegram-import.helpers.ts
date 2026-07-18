import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export type TelegramImportInput =
  | {
      type: 'username';
      username: string;
      channelRef: string;
    }
  | {
      type: 'invite';
      inviteHash: string;
      inviteLink: string;
    }
  | {
      type: 'title';
      titleQuery: string;
    };

export type ResolvedTelegramEntity = {
  kind: 'channel' | 'person';
  telegramChatId: string;
  title: string;
  username: string | null;
  description: string | null;
  participantsCount: number | null;
  photoUrl: string | null;
  telegramAccessHash?: string | null;
  inviteLink?: string | null;
  joinedByInvite?: boolean;
  accessMode?:
    | 'PUBLIC'
    | 'PRIVATE'
    | 'PRIVATE_INVITE'
    | 'PRIVATE_JOIN_REQUEST'
    | 'UNKNOWN';
  requiresJoinRequest?: boolean;
};

export type TelegramTitleCandidate<T = unknown> = {
  entity: T;
  entityId: string;
  kind: 'channel' | 'person';
  title: string;
  username: string | null;
  source: 'dialogs' | 'search';
};

export type TelegramTitleSuggestion = {
  title: string;
  username: string | null;
  kind: 'channel' | 'person';
};

export const MatchScore = {
  EXACT_TITLE: 100,
  EXACT_USERNAME: 90,
  TITLE_STARTS_WITH: 50,
  TITLE_INCLUDES: 25,
} as const;

const TELEGRAM_USERNAME_RE = /^[a-z][a-z0-9_]{3,31}$/i;

export function isTelegramUsername(value?: string | null) {
  return TELEGRAM_USERNAME_RE.test(String(value || '').trim().replace(/^@/, ''));
}

export function normalizeTelegramUsername(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const inviteUrlMatch = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{3,31})\/?$/i,
  );
  const profileUrlMatch = raw.match(
    /^tg:\/\/resolve\?domain=([A-Za-z][A-Za-z0-9_]{3,31})$/i,
  );
  const candidate = (
    inviteUrlMatch?.[1] ||
    profileUrlMatch?.[1] ||
    raw.replace(/^@/, '')
  )
    .trim()
    .toLowerCase();
  return isTelegramUsername(candidate) ? candidate : null;
}

export function normalizeTelegramTitle(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function canonicalTelegramInviteLink(inviteHash: string) {
  const normalized = String(inviteHash || '').trim().replace(/^\+/, '');
  if (!normalized) {
    throw new BadRequestException('Telegram invite link is invalid.');
  }
  return `https://t.me/+${normalized}`;
}

function parseInviteHashFromUrl(input: string) {
  const tgJoinMatch = input.match(/tg:\/\/join\?invite=([A-Za-z0-9_-]+)/i);
  if (tgJoinMatch?.[1]) {
    return tgJoinMatch[1];
  }
  const inviteUrlMatch = input.match(
    /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:joinchat\/|\+)([A-Za-z0-9_-]+)/i,
  );
  if (inviteUrlMatch?.[1]) {
    return inviteUrlMatch[1];
  }
  const bareInviteMatch = input.match(/^\+([A-Za-z0-9_-]+)$/);
  return bareInviteMatch?.[1] || null;
}

function parseTelegramUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BadRequestException('Telegram channel input is invalid');
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['t.me', 'telegram.me'].includes(hostname)) {
    throw new BadRequestException('Telegram channel input is invalid');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (!segments.length) {
    throw new BadRequestException('Telegram channel input is invalid');
  }
  if (segments[0] === 's' && segments[1]) {
    const username = normalizeTelegramUsername(segments[1]);
    if (!username) {
      throw new BadRequestException('Telegram channel input is invalid');
    }
    return { type: 'username', username, channelRef: `@${username}` } as const;
  }
  if (segments[0] === 'joinchat' && segments[1]) {
    return {
      type: 'invite',
      inviteHash: segments[1],
      inviteLink: canonicalTelegramInviteLink(segments[1]),
    } as const;
  }
  if (segments[0].startsWith('+')) {
    const inviteHash = segments[0].slice(1);
    return {
      type: 'invite',
      inviteHash,
      inviteLink: canonicalTelegramInviteLink(inviteHash),
    } as const;
  }
  const username = normalizeTelegramUsername(segments[0]);
  if (!username) {
    throw new BadRequestException('Telegram channel input is invalid');
  }
  return { type: 'username', username, channelRef: `@${username}` } as const;
}

export function parseTelegramImportInput(rawInput: string): TelegramImportInput {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new BadRequestException('Telegram channel input is required');
  }
  const inviteHash = parseInviteHashFromUrl(trimmed);
  if (inviteHash) {
    return {
      type: 'invite',
      inviteHash,
      inviteLink: canonicalTelegramInviteLink(inviteHash),
    };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return parseTelegramUrl(trimmed);
  }
  const username = normalizeTelegramUsername(trimmed);
  if (username) {
    return { type: 'username', username, channelRef: `@${username}` };
  }
  return { type: 'title', titleQuery: trimmed };
}

export function scoreTelegramTitleCandidate(
  query: string,
  candidate: Pick<TelegramTitleCandidate, 'title' | 'username'>,
) {
  const normalizedQuery = normalizeTelegramTitle(query);
  const normalizedTitle = normalizeTelegramTitle(candidate.title);
  const normalizedUsername = normalizeTelegramUsername(candidate.username);
  if (normalizedTitle === normalizedQuery) return MatchScore.EXACT_TITLE;
  if (normalizedUsername === normalizeTelegramUsername(normalizedQuery)) {
    return MatchScore.EXACT_USERNAME;
  }
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return MatchScore.TITLE_STARTS_WITH;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return MatchScore.TITLE_INCLUDES;
  }
  return 0;
}

export function resolveTelegramTitleCandidates<T>(
  query: string,
  candidates: TelegramTitleCandidate<T>[],
) {
  const scored = candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreTelegramTitleCandidate(query, candidate),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.kind !== right.kind) return left.kind === 'channel' ? -1 : 1;
      return left.title.localeCompare(right.title);
    });

  const top = scored[0];
  if (!top) {
    return {
      resolved: null,
      suggestions: [] as TelegramTitleSuggestion[],
      exact: false,
    };
  }

  const exact = top.score >= MatchScore.EXACT_USERNAME;
  const sameTopScore = scored.filter((candidate) => candidate.score === top.score);
  const sameKindTop = sameTopScore.filter((candidate) => candidate.kind === top.kind);
  if (exact && sameKindTop.length > 1) {
    throw new ConflictException(
      `Several Telegram channels named "${query}" were found. Use an exact @username or invite link.`,
    );
  }

  if (!exact) {
    return {
      resolved: null,
      suggestions: scored.slice(0, 5).map((candidate) => ({
        title: candidate.title,
        username: candidate.username,
        kind: candidate.kind,
      })),
      exact: false,
    };
  }

  return {
    resolved: top,
    suggestions: scored.slice(0, 5).map((candidate) => ({
      title: candidate.title,
      username: candidate.username,
      kind: candidate.kind,
    })),
    exact: true,
  };
}
