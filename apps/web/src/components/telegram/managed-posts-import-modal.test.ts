import { describe, expect, it } from "vitest";
import {
  editableRowsToJsonContent,
  editableRowToImportRow,
  normalizeImportRows,
  rowToEditable,
} from "@/components/telegram/managed-posts-import-modal";
import {
  buildManagedPostInternalLinks,
  hasBlockingManagedPostInternalLinks,
} from "@/components/telegram/managed-post-internal-links-notice";
import type { TelegramManagedPost } from "@/lib/api";

describe("managed posts import parsing", () => {
  it("keeps one JSON object as one editable post with emoji and images", () => {
    const rows = normalizeImportRows(
      JSON.stringify({
        title: "Не все важливе відчувається великим",
        text: "**🌱 Не все важливе відчувається великим**\n\nДеякі зміни приходять тихо.\n\nПомічай це.",
        icon: "🌱",
        imageUrls: ["https://images.example.test/post.jpg?fit=crop"],
        groupPosition: null,
      }),
      "posts.json",
    );

    expect(rows).toHaveLength(1);

    const editable = rowToEditable(rows[0]);
    expect(editable.title).toBe("Не все важливе відчувається великим");
    expect(editable.text).toContain("Деякі зміни приходять тихо.");
    expect(editable.icon).toBe("🌱");
    expect(editable.urlsText).toBe("https://images.example.test/post.jpg?fit=crop");
  });

  it("imports the edited preview rows instead of the original pasted text", () => {
    const editable = rowToEditable({
      title: "Original",
      text: "Before",
      icon: "🔥",
      urls: ["[image](https://cdn.example.test/before.png)"],
      groupPosition: null,
    });

    const row = editableRowToImportRow({
      ...editable,
      title: "Edited",
      text: "After",
      icon: "🌗",
      urlsText: "https://cdn.example.test/after.png",
    });

    expect(row).toMatchObject({
      title: "Edited",
      text: "After",
      icon: "🌗",
      urls: ["https://cdn.example.test/after.png"],
    });
  });

  it("keeps image search hints only in the editable import preview", () => {
    const [row] = normalizeImportRows(
      JSON.stringify([
        {
          title: "Image hint post",
          text: "Body",
          imageSearch: ["mountain rest", "quiet lake"],
        },
      ]),
      "posts.json",
    );

    const editable = rowToEditable(row);
    expect(editable.imageSearchText).toBe("mountain rest\nquiet lake");

    const importRow = editableRowToImportRow(editable);
    expect(importRow).not.toHaveProperty("imageSearch");
  });

  it("serializes edited preview rows back to GPT-friendly JSON", () => {
    const editable = rowToEditable({
      title: "Original",
      text: "Before",
      icon: "🌗",
      urls: ["https://cdn.example.test/before.png"],
      imageSearch: ["old search"],
      groupPosition: null,
    });

    const json = editableRowsToJsonContent([
      {
        ...editable,
        title: "Edited",
        text: "After",
        urlsText: "https://pinterest.example.test/image.jpg",
        imageSearchText: "new pinterest query\nquiet window",
      },
    ]);

    expect(JSON.parse(json)).toEqual([
      {
        title: "Edited",
        text: "After",
        icon: "🌗",
        urls: ["https://pinterest.example.test/image.jpg"],
        groupPosition: null,
        imageSearch: ["new pinterest query", "quiet window"],
      },
    ]);
  });

  it("detects blocking internal post links for import preview rows", () => {
    const publishedPost = {
      id: "ready-post",
      title: "Ready post",
      status: "PUBLISHED",
      telegramRemoteStatus: "PUBLISHED",
      telegramMessageIds: ["42"],
      lastError: null,
    } as unknown as TelegramManagedPost;
    const draftPost = {
      id: "draft-post",
      title: "Draft post",
      status: "DRAFT",
      telegramRemoteStatus: null,
      telegramMessageIds: [],
      lastError: null,
    } as unknown as TelegramManagedPost;

    const links = buildManagedPostInternalLinks(
      "[Ready](tg-post:ready-post) and [Draft](tg-post:draft-post)",
      [publishedPost, draftPost],
    );

    expect(links.map((link) => link.targetId)).toEqual([
      "ready-post",
      "draft-post",
    ]);
    expect(hasBlockingManagedPostInternalLinks(links, "12345")).toBe(true);
  });
});
