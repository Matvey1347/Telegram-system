import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

  it("handles native preview undo and redo directly inside the editable preview", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start");
      return (
        <TelegramPostPreview
          channelTitle="Ментор | Саморозвиток"
          text={value}
          imageUrls={[]}
          onTextChange={setValue}
        />
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(".telegram-preview-text");
    expect(editor).toBeTruthy();

    await user.click(editor as HTMLElement);
    (editor as HTMLElement).innerHTML = "<div>Changed</div>";
    fireEvent.input(editor as HTMLElement);
    expect(screen.getByText("Changed")).toBeTruthy();

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyUndo",
      }),
    );
    expect(screen.getByText("Start")).toBeTruthy();

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyRedo",
      }),
    );
    expect(screen.getByText("Changed")).toBeTruthy();
  });

  it("collapses preview selection on undo even when there is no history entry", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start text");
      return (
        <TelegramPostPreview
          channelTitle="Ментор | Саморозвиток"
          text={value}
          imageUrls={[]}
          onTextChange={setValue}
        />
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(".telegram-preview-text") as HTMLElement;
    expect(editor).toBeTruthy();

    await user.click(editor);
    const textNode = editor.firstChild?.firstChild ?? editor.firstChild;
    expect(textNode).toBeTruthy();

    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode as Node, 0);
    range.setEnd(textNode as Node, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(selection?.isCollapsed).toBe(false);

    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyUndo",
      }),
    );

    expect(selection?.isCollapsed).toBe(true);
  });
});
