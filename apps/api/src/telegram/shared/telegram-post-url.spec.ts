import { parseTelegramPostUrl } from './telegram-post-url';

describe('parseTelegramPostUrl', () => {
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
