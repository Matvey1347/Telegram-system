import { describe, expect, it } from "vitest";
import {
  editableRowToImportRow,
  normalizeImportRows,
  rowToEditable,
} from "@/components/telegram/managed-posts-import-modal";

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
});
