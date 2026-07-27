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
});
