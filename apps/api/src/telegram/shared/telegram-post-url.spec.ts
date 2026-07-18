import {
  buildStableTelegramPostUrl,
  normalizeTelegramChannelId,
  parseTelegramPostUrl,
} from './telegram-post-url';

describe('telegram-post-url helpers', () => {
  it('normalizes Telegram channel ids safely', () => {
    expect(normalizeTelegramChannelId('-1003976683330')).toBe('3976683330');
    expect(normalizeTelegramChannelId('3976683330')).toBe('3976683330');
    expect(normalizeTelegramChannelId('-3976683330')).toBe('3976683330');
  });

  it('builds stable internal Telegram post urls', () => {
    expect(
      buildStableTelegramPostUrl({
        telegramChatId: '-1003976683330',
        messageId: '33',
      }),
    ).toBe('https://t.me/c/3976683330/33');
  });

  it('does not use username as a fallback for Telegram post urls', () => {
    expect(
      buildStableTelegramPostUrl({
        telegramChatId: '-1003976683330',
        messageId: '33',
      }),
    ).toBe('https://t.me/c/3976683330/33');
  });

  it('keeps stable internal urls unchanged across username changes', () => {
    const messageId = '33';
    const telegramChatId = '-1003976683330';

    expect(
      ['test_tg_system', 'new_test_tg_system', 'another_name', null].map(
        () =>
          buildStableTelegramPostUrl({
            telegramChatId,
            messageId,
          }),
      ),
    ).toEqual([
      'https://t.me/c/3976683330/33',
      'https://t.me/c/3976683330/33',
      'https://t.me/c/3976683330/33',
      'https://t.me/c/3976683330/33',
    ]);
  });

  it('parses a public channel post URL', () => {
    expect(parseTelegramPostUrl('https://t.me/My_Channel/123')).toEqual({
      kind: 'public',
      username: 'my_channel',
      messageId: '123',
    });
  });

  it('parses a private channel post URL', () => {
    expect(parseTelegramPostUrl('https://t.me/c/123456/789')).toEqual({
      kind: 'private',
      chatId: '123456',
      messageId: '789',
    });
  });

  it.each([
    'http://t.me/channel/1',
    'https://example.com/channel/1',
    'https://t.me/channel/not-a-message',
  ])('rejects invalid URL %s', (url) => {
    expect(parseTelegramPostUrl(url)).toBeNull();
  });
});
