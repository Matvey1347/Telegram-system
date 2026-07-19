const sharpToBufferMock = jest.fn();
const sharpJpegMock = jest.fn(() => ({
  toBuffer: sharpToBufferMock,
}));
const sharpRotateMock = jest.fn(() => ({
  jpeg: sharpJpegMock,
}));

jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    rotate: sharpRotateMock,
  })),
}));

import { TelegramMtprotoClient } from './telegram-mtproto.client';

describe('TelegramMtprotoClient publishPost', () => {
  beforeEach(() => {
    sharpToBufferMock.mockReset();
    sharpJpegMock.mockClear();
    sharpRotateMock.mockClear();
  });

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

  it('sends multi-image albums with html captions so IMAGES_THEN_TEXT works', async () => {
    const client = new TelegramMtprotoClient();
    const fakeTelegramClient = {
      getEntity: jest.fn().mockResolvedValue('entity'),
      sendFile: jest.fn().mockResolvedValue([{ id: 123 }, { id: 124 }]),
      getInputEntity: jest.fn().mockResolvedValue('input-entity'),
      invoke: jest.fn().mockResolvedValue({}),
      _getResponseMessage: jest.fn().mockReturnValue({ id: 125 }),
    };

    jest
      .spyOn(client as never, 'createClient' as never)
      .mockResolvedValue(fakeTelegramClient as never);
    jest
      .spyOn(client as never, 'closeClient' as never)
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(client as never, 'downloadPublishImage' as never)
      .mockResolvedValueOnce('/tmp/image-1.png' as never)
      .mockResolvedValueOnce('/tmp/image-2.png' as never);

    await client.publishPost({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channelRef: '@bizpatterns',
      html: '<b>Album text</b>',
      captionHtml: '<b>Album text</b>',
      followupHtmlParts: ['Followup text'],
      imageUrls: [
        'https://example.com/image-1.png',
        'https://example.com/image-2.png',
      ],
    });

    expect(fakeTelegramClient.sendFile).toHaveBeenCalledWith(
      'entity',
      expect.objectContaining({
        file: ['/tmp/image-1.png', '/tmp/image-2.png'],
        caption: ['<b>Album text</b>'],
        parseMode: 'html',
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

  it('converts avif images to jpeg before Telegram upload', async () => {
    const client = new TelegramMtprotoClient();
    sharpToBufferMock.mockResolvedValue(Buffer.from('jpeg-binary'));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/avif',
          'content-length': '11',
        }),
        arrayBuffer: async () => Buffer.from('avif-binary'),
      } as unknown as Response);

    const file = await (client as any).downloadPublishImage(
      'https://example.com/post-image.avif',
      0,
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(sharpRotateMock).toHaveBeenCalled();
    expect(sharpJpegMock).toHaveBeenCalled();
    expect(file.name).toBe('telegram-post-1.jpg');
    expect(file.size).toBe(Buffer.from('jpeg-binary').length);

    fetchMock.mockRestore();
  });

  it('falls back to sips when sharp cannot decode avif', async () => {
    const client = new TelegramMtprotoClient();
    sharpToBufferMock.mockRejectedValue(
      new Error('heif: Invalid input: Bitstream not supported by this decoder'),
    );
    jest
      .spyOn(client as never, 'convertImageBufferWithSips' as never)
      .mockResolvedValue(Buffer.from('jpeg-from-sips') as never);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'image/avif',
          'content-length': '11',
        }),
        arrayBuffer: async () => Buffer.from('avif-binary'),
      } as unknown as Response);

    const file = await (client as any).downloadPublishImage(
      'https://example.com/post-image.avif',
      0,
    );

    expect(file.name).toBe('telegram-post-1.jpg');
    expect(file.size).toBe(Buffer.from('jpeg-from-sips').length);

    fetchMock.mockRestore();
  });
});
