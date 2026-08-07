import { describe, expect, it } from "vitest";
import { extractAutoPrefilledPostTitle } from "@/lib/telegram-post-title";

describe("telegram-post-title", () => {
  it("extracts a leading emoji and first-line title from telegram text", () => {
    expect(
      extractAutoPrefilledPostTitle(
        "🧩 Наведи лад лише в одному місці\n\nНе потрібно прибирати всю кімнату.",
      ),
    ).toEqual({
      emoji: "🧩",
      title: "Наведи лад лише в одному місці",
    });
  });

  it("extracts a trailing emoji and ignores simple markdown wrappers", () => {
    expect(
      extractAutoPrefilledPostTitle(
        "**Наведи лад лише в одному місці 🧩**\n\nТекст поста",
      ),
    ).toEqual({
      emoji: "🧩",
      title: "Наведи лад лише в одному місці",
    });
  });

  it("does not add a grouped post number to extracted titles", () => {
    expect(extractAutoPrefilledPostTitle("💰 Як працює кешбек?")).toEqual({
      emoji: "💰",
      title: "Як працює кешбек?",
    });
  });
});
