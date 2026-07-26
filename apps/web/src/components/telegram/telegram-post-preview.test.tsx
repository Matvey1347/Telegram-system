import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";

describe("TelegramPostPreview", () => {
  it("renders quote content tightly and keeps media messages in the shared Telegram layout", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"> Ти хочеш щось вирішити чи просто довести, що маєш рацію?\n[Ментор | Саморозвиток]"}
        imageUrls={["https://cdn.test/quote-image.png"]}
      />,
    );

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeTruthy();
    expect(blockquote?.textContent).toContain(
      "Ти хочеш щось вирішити чи просто довести, що маєш рацію?",
    );

    const textContainer = container.querySelector(".telegram-preview-text");
    expect(textContainer?.parentElement?.className).toContain("px-4");

    const previewImage = container.querySelector(
      'img[src="https://cdn.test/quote-image.png"]',
    );
    expect(previewImage?.className).toContain("object-cover");
  });

  it("adds a quote gap only when the source text contains an empty line before the quote", () => {
    const withGap = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Перший абзац.\n\n> Цитата з відступом"}
        imageUrls={[]}
      />,
    );
    expect(withGap.container.querySelector(".tg-quote-gap")).toBeTruthy();

    const withoutGap = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"Перший абзац.\n> Цитата без відступу"}
        imageUrls={[]}
      />,
    );
    expect(withoutGap.container.querySelector(".tg-quote-gap")).toBeFalsy();
  });
});
