import { describe, expect, it } from "vitest";
import { buildTelegramPostsUrl } from "@/lib/telegram-posts-url";

describe("buildTelegramPostsUrl", () => {
  it("builds explicit editor urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postId: "post-1",
        postView: "editor",
      }),
    ).toBe("/telegram-posts?channelId=channel-1&postId=post-1&postView=editor");
  });

  it("builds explicit calendar urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postView: "calendar",
      }),
    ).toBe("/telegram-posts?channelId=channel-1&postView=calendar");
  });

  it("keeps groups separate from editor and calendar urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        groupId: "group-1",
      }),
    ).toBe("/telegram-posts?channelId=channel-1&groupId=group-1");
  });
});
