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

  it("cleans nested generated markdown from auto-prefilled titles", () => {
    expect(
      extractAutoPrefilledPostTitle(
        "### **[Наведи лад лише в одному місці](https://example.com) 🧩**\n\nТекст поста",
      ),
    ).toEqual({
      emoji: "🧩",
      title: "Наведи лад лише в одному місці",
    });
  });

  it("cleans markdown list and quote markers before extracting titles", () => {
    expect(extractAutoPrefilledPostTitle("> - `🧠 Думка дня`")).toEqual({
      emoji: "🧠",
      title: "Думка дня",
    });
  });

  it("strips generated heading and unmatched bold markers only from auto titles", () => {
    expect(extractAutoPrefilledPostTitle("# Hello")).toEqual({
      emoji: null,
      title: "Hello",
    });
    expect(extractAutoPrefilledPostTitle("**🧠 Hello")).toEqual({
      emoji: "🧠",
      title: "Hello",
    });
    expect(extractAutoPrefilledPostTitle("Title**")).toEqual({
      emoji: null,
      title: "Title",
    });
  });

  it("keeps meaningful asterisks inside generated titles", () => {
    expect(extractAutoPrefilledPostTitle("5 * 5 = 25")).toEqual({
      emoji: null,
      title: "5 * 5 = 25",
    });
    expect(extractAutoPrefilledPostTitle("C* algorithm")).toEqual({
      emoji: null,
      title: "C* algorithm",
    });
  });
});
