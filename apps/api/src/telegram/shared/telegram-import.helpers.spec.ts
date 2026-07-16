import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  canonicalTelegramInviteLink,
  normalizeTelegramTitle,
  parseTelegramImportInput,
  resolveTelegramTitleCandidates,
} from './telegram-import.helpers';

describe('telegram import helpers', () => {
  it.each([
    ['@channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://t.me/channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['http://t.me/channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://telegram.me/channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://t.me/s/channel_name', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://t.me/channel_name/123', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://t.me/channel_name?foo=bar', { type: 'username', username: 'channel_name', channelRef: '@channel_name' }],
    ['https://t.me/+dtmYmT-l2Mo1Yzgy', { type: 'invite', inviteHash: 'dtmYmT-l2Mo1Yzgy', inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy' }],
    ['http://t.me/+AbC_123-xyz/', { type: 'invite', inviteHash: 'AbC_123-xyz', inviteLink: 'https://t.me/+AbC_123-xyz' }],
    [' https://telegram.me/+AbC_123-xyz?foo=bar ', { type: 'invite', inviteHash: 'AbC_123-xyz', inviteLink: 'https://t.me/+AbC_123-xyz' }],
    ['https://t.me/joinchat/dtmYmT-l2Mo1Yzgy', { type: 'invite', inviteHash: 'dtmYmT-l2Mo1Yzgy', inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy' }],
    ['https://t.me/joinchat/AbC_123-xyz/?foo=bar', { type: 'invite', inviteHash: 'AbC_123-xyz', inviteLink: 'https://t.me/+AbC_123-xyz' }],
    ['tg://join?invite=dtmYmT-l2Mo1Yzgy', { type: 'invite', inviteHash: 'dtmYmT-l2Mo1Yzgy', inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy' }],
    ['tg://join?invite=AbC_123-xyz&foo=bar', { type: 'invite', inviteHash: 'AbC_123-xyz', inviteLink: 'https://t.me/+AbC_123-xyz' }],
    ['+AbC_123-xyz', { type: 'invite', inviteHash: 'AbC_123-xyz', inviteLink: 'https://t.me/+AbC_123-xyz' }],
    ['Смак Життя', { type: 'title', titleQuery: 'Смак Життя' }],
    ['  Смак   Життя  ', { type: 'title', titleQuery: 'Смак   Життя' }],
  ])('parses %s', (input, expected) => {
    expect(parseTelegramImportInput(input)).toEqual(expected);
  });

  it('normalizes telegram titles with unicode and spaces', () => {
    expect(normalizeTelegramTitle('  Смак   Життя  ')).toBe('смак життя');
  });

  it('throws for empty input', () => {
    expect(() => parseTelegramImportInput('   ')).toThrow(BadRequestException);
  });

  it('throws for invalid telegram url', () => {
    expect(() => parseTelegramImportInput('https://example.com/channel_name')).toThrow(
      BadRequestException,
    );
  });

  it('does not parse invite hash as username', () => {
    expect(parseTelegramImportInput('+dtmYmT-l2Mo1Yzgy')).toEqual({
      type: 'invite',
      inviteHash: 'dtmYmT-l2Mo1Yzgy',
      inviteLink: 'https://t.me/+dtmYmT-l2Mo1Yzgy',
    });
  });

  it('creates canonical invite link', () => {
    expect(canonicalTelegramInviteLink('dtmYmT-l2Mo1Yzgy')).toBe(
      'https://t.me/+dtmYmT-l2Mo1Yzgy',
    );
  });

  it('resolves unique exact title match', () => {
    const result = resolveTelegramTitleCandidates('Смак Життя', [
      {
        entity: { id: '1' },
        entityId: '1',
        kind: 'channel',
        title: 'Смак Життя',
        username: null,
        source: 'dialogs',
      },
      {
        entity: { id: '2' },
        entityId: '2',
        kind: 'channel',
        title: 'Смак життя та бізнес',
        username: 'smakbiz',
        source: 'search',
      },
    ]);
    expect(result.resolved?.entityId).toBe('1');
    expect(result.exact).toBe(true);
  });

  it('throws on several exact title matches of same preferred kind', () => {
    expect(() =>
      resolveTelegramTitleCandidates('Смак Життя', [
        {
          entity: { id: '1' },
          entityId: '1',
          kind: 'channel',
          title: 'Смак Життя',
          username: null,
          source: 'dialogs',
        },
        {
          entity: { id: '2' },
          entityId: '2',
          kind: 'channel',
          title: 'Смак Життя',
          username: 'smak2',
          source: 'search',
        },
      ]),
    ).toThrow(ConflictException);
  });

  it('does not auto-resolve fuzzy results and limits suggestions', () => {
    const result = resolveTelegramTitleCandidates(
      'Смак',
      Array.from({ length: 7 }, (_, index) => ({
        entity: { id: `${index}` },
        entityId: `${index}`,
        kind: 'channel' as const,
        title: `Смак ${index}`,
        username: `smak_${index}`,
        source: index % 2 ? 'search' as const : 'dialogs' as const,
      })),
    );
    expect(result.resolved).toBeNull();
    expect(result.suggestions).toHaveLength(5);
  });
});
