import { TelegramMtprotoClient } from './telegram-mtproto.client';

describe('TelegramMtprotoClient publishPost', () => {
  it('sends a single image as a single file so caption entities survive', async () => {
    const client = new TelegramMtprotoClient();
    const fakeTelegramClient = {
      getEntity: jest.fn().mockResolvedValue('entity'),
      sendFile: jest.fn().mockResolvedValue({ id: 123 }),
    };

    jest
      .spyOn(client as never, 'createClient' as never)
      .mockResolvedValue(fakeTelegramClient as never);
    jest
      .spyOn(client as never, 'closeClient' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(client as never, 'downloadPublishImage' as never)
      .mockResolvedValue('/tmp/image.png' as never);

    await client.publishPost({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@bizpatterns',
      html: '<b>Title</b>',
      captionHtml:
        'То есть логика такая:\n<pre><code class="language-сделка">убрать слабый актив</code></pre>',
      followupHtmlParts: [],
      imageUrls: ['https://example.com/image.png'],
    });

    expect(fakeTelegramClient.sendFile).toHaveBeenCalledWith(
      'entity',
      expect.objectContaining({
        file: '/tmp/image.png',
        parseMode: false,
      }),
    );
  });

  it('keeps webpage previews enabled for text-only posts', async () => {
    const client = new TelegramMtprotoClient();
    const fakeTelegramClient = {
      getEntity: jest.fn().mockResolvedValue('entity'),
      getInputEntity: jest.fn().mockResolvedValue('input-entity'),
      invoke: jest.fn().mockResolvedValue({}),
      _getResponseMessage: jest.fn().mockReturnValue({ id: 123 }),
    };

    jest
      .spyOn(client as never, 'createClient' as never)
      .mockResolvedValue(fakeTelegramClient as never);
    jest
      .spyOn(client as never, 'closeClient' as never)
      .mockResolvedValue(undefined as never);

    await client.publishPost({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@bizpatterns',
      html: 'https://example.com',
      imageUrls: [],
    });

    const request = fakeTelegramClient.invoke.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Object);
    expect((request as { noWebpage?: boolean }).noWebpage).toBeUndefined();
  });
});
