import { telegramMarkupToHtml } from './telegram-markup';

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
    expect(
      telegramMarkupToHtml(
        '**__++~~||formatted||~~++__**',
      ),
    ).toBe(
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
});
