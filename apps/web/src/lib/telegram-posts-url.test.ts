import { describe, expect, it } from "vitest";
import {
  buildTelegramPostsLegacyRedirectUrl,
  buildTelegramPostsUrl,
} from "@/lib/telegram-posts-url";

describe("buildTelegramPostsUrl", () => {
  it("builds explicit editor urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postId: "post-1",
        postView: "editor",
      }),
    ).toBe("/telegram-posts/channel-1/editor?postId=post-1");
  });

  it("builds explicit calendar urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postView: "calendar",
      }),
    ).toBe("/telegram-posts/channel-1/calendar");
  });

  it("keeps groups separate from editor and calendar urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        groupId: "group-1",
      }),
    ).toBe("/telegram-posts?channelId=channel-1&groupId=group-1");
  });

  it("preserves unrelated query params on canonical urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel 1",
        postId: "post-1",
        postView: "editor",
        extraParams: "utm=sidebar&channelId=old&postView=calendar",
      }),
    ).toBe("/telegram-posts/channel%201/editor?utm=sidebar&postId=post-1");
  });
});

describe("buildTelegramPostsLegacyRedirectUrl", () => {
  it("redirects legacy editor urls to canonical urls and preserves extra params", () => {
    expect(
      buildTelegramPostsLegacyRedirectUrl(
        new URLSearchParams(
          "channelId=channel-1&postId=post-1&postView=editor&source=notification",
        ),
      ),
    ).toBe("/telegram-posts/channel-1/editor?source=notification&postId=post-1");
  });

  it("does not redirect grouped legacy urls", () => {
    expect(
      buildTelegramPostsLegacyRedirectUrl(
        new URLSearchParams(
          "channelId=channel-1&groupId=group-1&postView=editor&source=sidebar",
        ),
      ),
    ).toBeNull();
  });
});
