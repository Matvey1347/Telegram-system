import { describe, expect, it } from "vitest";
import {
  editorHtmlToTelegramMarkup,
  telegramMarkupToEditorHtml,
} from "./telegram-text-editor-format";

describe("telegram-text-editor-format", () => {
  it("renders stored markup as formatted editor html", () => {
    expect(
      telegramMarkupToEditorHtml(
        "**Bold** __Italic__ ++Underlined++ ~~Gone~~ ||Hidden||",
      ),
    ).toContain("<strong>Bold</strong>");
    expect(
      telegramMarkupToEditorHtml(
        "**Bold** __Italic__ ++Underlined++ ~~Gone~~ ||Hidden||",
      ),
    ).toContain('<span data-telegram-spoiler="true">Hidden</span>');
  });

  it("serializes formatted editor html back to telegram markup", () => {
    const html = [
      "<div><strong>Bold</strong> <em>Italic</em> <u>Underlined</u></div>",
      '<div><a href="https://example.com/" target="_blank" rel="noreferrer">Site</a></div>',
      '<div><a href="tg-post:post_1" data-internal-post-id="post_1">Internal</a></div>',
      '<blockquote>Quoted<br>line</blockquote>',
      "<pre data-language=\"js\"><code>const x = 1;\n</code></pre>",
    ].join("");

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      [
        "**Bold** __Italic__ ++Underlined++",
        "[Site](https://example.com/)",
        "[Internal](tg-post:post_1)",
        "> Quoted",
        "> line",
        "```js",
        "const x = 1;",
        "```",
      ].join("\n"),
    );
  });

  it("keeps manually typed markdown symbols as plain text", () => {
    expect(editorHtmlToTelegramMarkup("<div>**manual** __typed__</div>")).toBe(
      "**manual** __typed__",
    );
  });

  it("treats same-line fenced text as a Telegram code block label", () => {
    expect(
      telegramMarkupToEditorHtml(
        "```немає чужого бренду\n→ менша брендова націнка\n```",
      ),
    ).toContain(
      '<pre data-language="немає чужого бренду"><code>→ менша брендова націнка\n</code></pre>',
    );
  });

  it("serializes Telegram preview code blocks back to fenced markup", () => {
    const html =
      '<pre class="tg-code-block" data-code-label="немає чужого бренду" data-has-code-label="true"><span class="tg-code-header" contenteditable="false"><span>немає чужого бренду</span><button type="button" data-copy-code aria-label="Copy code" contenteditable="false"></button></span><code>→ менша брендова націнка\n</code></pre>';

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      "```немає чужого бренду\n→ менша брендова націнка\n```",
    );
  });

  it("keeps a newline before a blockquote when preview editing leaves plain text at the root", () => {
    const html =
      "Відпишися хоча б від десяти джерел, які дають більше шуму, ніж користі.<blockquote>Твоя стрічка — це середовище, у якому щодня живе твоя увага</blockquote>";

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      [
        "Відпишися хоча б від десяти джерел, які дають більше шуму, ніж користі.",
        "> Твоя стрічка — це середовище, у якому щодня живе твоя увага",
      ].join("\n"),
    );
  });

  it("preserves internal preview links instead of serializing them as # links", () => {
    const html =
      '<a href="tg-post:cms1gk8p20002htri28wdha4m" data-internal-post-link="cms1gk8p20002htri28wdha4m" data-internal-post-id="cms1gk8p20002htri28wdha4m">цука5е</a>';

    expect(editorHtmlToTelegramMarkup(html)).toBe(
      "[цука5е](tg-post:cms1gk8p20002htri28wdha4m)",
    );
  });
});
