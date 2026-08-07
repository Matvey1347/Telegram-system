import { describe, expect, it } from "vitest";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";

describe("iconToResolvedEmoji", () => {
  it("maps legacy emoji icons to the shared unicode presentation", () => {
    expect(
      iconToResolvedEmoji({
        id: "icon-1",
        type: "emoji",
        name: "rocket",
        emoji: "🚀",
        imageUrl: null,
      }),
    ).toEqual({ type: "unicode", value: "🚀", name: "rocket" });
  });

  it("maps legacy image icons to the shared image presentation", () => {
    expect(
      iconToResolvedEmoji({
        id: "icon-2",
        type: "image",
        name: "logo",
        emoji: null,
        imageUrl: "https://example.com/logo.png",
      }),
    ).toEqual({
      type: "image",
      id: "icon-2",
      url: "https://example.com/logo.png",
      name: "logo",
    });
  });

  it("keeps already resolved emoji unchanged", () => {
    const resolved = { type: "unicode" as const, value: "✅", name: null };

    expect(iconToResolvedEmoji(resolved)).toBe(resolved);
  });
});
