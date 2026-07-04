import { Api } from 'telegram';
import { HTMLParser } from 'telegram/extensions/html';
import { parseTelegramSpoilers } from '@telegram-system/shared/telegram-spoilers';
import {
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
} from './telegram-markup';

describe('telegramMarkupToHtml', () => {
  it('converts supported formatting and escapes user html', () => {
    expect(
      telegramMarkupToHtml(
        '**bold** __italic__ ~~old~~ ||secret|| `x < y` <script>',
      ),
    ).toBe(
      '<b>bold</b> <i>italic</i> <s>old</s> <tg-spoiler>secret</tg-spoiler> <code>x &lt; y</code> &lt;script&gt;',
    );
  });

  it('converts fenced code blocks', () => {
    expect(telegramMarkupToHtml('```js\nconst x = 1 < 2\n```')).toBe(
      '<pre><code class="language-js">const x = 1 &lt; 2\n</code></pre>',
    );
  });

  it('converts markdown links to safe Telegram HTML links', () => {
    expect(
      telegramMarkupToHtml(
        'Открой [мой сайт](https://example.com) и [страницу](https://example.com/a?x=1&y=2)',
      ),
    ).toBe(
      'Открой <a href="https://example.com/">мой сайт</a> и <a href="https://example.com/a?x=1&amp;y=2">страницу</a>',
    );
  });

  it('does not create links for unsafe protocols or markup inside code', () => {
    expect(
      telegramMarkupToHtml(
        '[unsafe](javascript:alert(1)) `[code](https://example.com)`',
      ),
    ).toBe(
      '[unsafe](javascript:alert(1)) <code>[code](https://example.com)</code>',
    );
  });

  it('does not create a Telegram link for an incomplete hostname', () => {
    expect(telegramMarkupToHtml('[site](https://invalid)')).toBe(
      '[site](https://invalid)',
    );
  });

  it('supports underline and nested formatting', () => {
    expect(telegramMarkupToHtml('**__++~~||formatted||~~++__**')).toBe(
      '<b><i><u><s><tg-spoiler>formatted</tg-spoiler></s></u></i></b>',
    );
  });

  it('converts regular and expandable quote blocks', () => {
    expect(
      telegramMarkupToHtml(
        '> First line\n> **Second line**\n\n>> Hidden first\n>> Hidden second',
      ),
    ).toBe(
      '<blockquote>First line\n<b>Second line</b></blockquote>\n\n<blockquote expandable>Hidden first\nHidden second</blockquote>',
    );
  });

  it('normalizes spoiler tags for GramJS MTProto HTML parsing', () => {
    expect(
      telegramHtmlToMtprotoHtml(
        '<b>visible</b> <tg-spoiler>secret</tg-spoiler>',
      ),
    ).toBe('<b>visible</b> <spoiler>secret</spoiler>');
  });

  it('lets GramJS parse spoilers as MTProto spoiler entities', () => {
    const [text, entities] = HTMLParser.parse(
      telegramHtmlToMtprotoHtml('<tg-spoiler>hidden text</tg-spoiler>'),
    );

    expect(text).toBe('hidden text');
    expect(entities).toHaveLength(1);
    expect(entities[0]).toBeInstanceOf(Api.MessageEntitySpoiler);
  });
});

describe('parseTelegramSpoilers', () => {
  it.each([
    [
      'hello ||secret|| world',
      'hello secret world',
      [{ type: 'spoiler', offset: 6, length: 6 }],
    ],
    ['||secret||', 'secret', [{ type: 'spoiler', offset: 0, length: 6 }]],
    [
      'a ||one|| b ||two|| c',
      'a one b two c',
      [
        { type: 'spoiler', offset: 2, length: 3 },
        { type: 'spoiler', offset: 8, length: 3 },
      ],
    ],
    [
      'привет ||секрет|| текст',
      'привет секрет текст',
      [{ type: 'spoiler', offset: 7, length: 6 }],
    ],
    [
      'emoji 😀 ||hidden 😀 text|| end',
      'emoji 😀 hidden 😀 text end',
      [{ type: 'spoiler', offset: 9, length: 14 }],
    ],
  ] as const)('parses spoiler entities for %s', (input, text, entities) => {
    expect(parseTelegramSpoilers(input)).toEqual({ text, entities });
  });

  it('leaves an unmatched delimiter as safe plain text', () => {
    expect(parseTelegramSpoilers('broken ||secret')).toEqual({
      text: 'broken ||secret',
      entities: [],
    });
  });

  it('keeps empty delimiters literal and creates no empty entity', () => {
    expect(parseTelegramSpoilers('empty |||| test')).toEqual({
      text: 'empty |||| test',
      entities: [],
    });
  });

  it('produces an explicit GramJS spoiler entity with UTF-16 offsets', () => {
    const html = telegramMarkupToHtml('emoji 😀 ||hidden 😀 text|| end');
    const [text, entities] = HTMLParser.parse(telegramHtmlToMtprotoHtml(html));
    const spoiler = entities.find(
      (entity) => entity instanceof Api.MessageEntitySpoiler,
    );

    expect(text).toBe('emoji 😀 hidden 😀 text end');
    expect(spoiler).toMatchObject({ offset: 9, length: 14 });
  });
});
