import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders same-line fenced text with spaces as a labeled Telegram code block", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"```немає чужого бренду\n→ менша брендова націнка\n```"}
        imageUrls={[]}
      />,
    );

    const codeHeader = container.querySelector(".tg-code-header span");
    const codeBlock = container.querySelector(".tg-code-block code");
    expect(codeHeader?.textContent).toBe("немає чужого бренду");
    expect(codeBlock?.textContent).toContain("→ менша брендова націнка");
  });

  it("keeps Telegram code blocks inside the editable preview", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={"```немає чужого бренду\n→ менша брендова націнка\n```"}
        imageUrls={[]}
        onTextChange={() => {}}
      />,
    );

    const editor = container.querySelector(
      '.telegram-preview-text[contenteditable="true"]',
    );
    const codeHeader = container.querySelector(".tg-code-header");
    const copyButton = container.querySelector("[data-copy-code]");

    expect(editor).toBeTruthy();
    expect(codeHeader?.textContent).toContain("немає чужого бренду");
    expect(copyButton).toBeTruthy();
  });

  it("does not add an extra gap after a code block when the source has only one newline", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={
          "Суть проста:\n```немає чужого бренду\n→ менша брендова націнка\n```\n📦 Для Pepco це особливо важливо"
        }
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.innerHTML).toContain("Суть проста:<pre");
    expect(preview?.innerHTML).toContain("</pre>📦 Для Pepco це особливо важливо");
    expect(preview?.innerHTML).not.toContain("</pre><br>");
    expect(preview?.querySelectorAll(".tg-quote-gap")).toHaveLength(0);
  });

  it("keeps a visual gap after a code block when the source has an empty line", () => {
    const { container } = render(
      <TelegramPostPreview
        channelTitle="Ментор | Саморозвиток"
        text={
          "Суть проста:\n```немає чужого бренду\n→ менша брендова націнка\n```\n\n📦 Для Pepco це особливо важливо"
        }
        imageUrls={[]}
      />,
    );

    const preview = container.querySelector(".telegram-preview-text");
    expect(preview?.innerHTML).toContain(
      '</pre><span class="tg-quote-gap" aria-hidden="true"></span>📦 Для Pepco це особливо важливо',
    );
  });

  it("handles native preview undo and redo directly inside the editable preview", async () => {
    const user = userEvent.setup();

    function PreviewHarness() {
      const [value, setValue] = useState("Start");
      return (
        <>
          <TelegramPostPreview
            channelTitle="Ментор | Саморозвиток"
            text={value}
            imageUrls={[]}
            onTextChange={setValue}
          />
          <output data-testid="preview-value">{value}</output>
        </>
      );
    }

    const { container } = render(<PreviewHarness />);
    const editor = container.querySelector(".telegram-preview-text");
    expect(editor).toBeTruthy();

    await user.click(editor as HTMLElement);
    (editor as HTMLElement).innerHTML = "<div>Changed</div>";
    fireEvent.input(editor as HTMLElement);
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Changed");
    });

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyUndo",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Start");
    });

    editor?.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "historyRedo",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("preview-value").textContent).toBe("Changed");
    });
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
