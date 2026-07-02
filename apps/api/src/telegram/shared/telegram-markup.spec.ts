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
});
