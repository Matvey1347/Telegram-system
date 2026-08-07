import type { Icon, ResolvedEmoji } from "@/lib/api";

export function iconToResolvedEmoji(
  icon?: Icon | ResolvedEmoji | null,
): ResolvedEmoji | null {
  if (!icon) return null;
  if (icon.type === "unicode") return icon;
  if (icon.type === "image" && "url" in icon) return icon;
  if (icon.type === "emoji" && icon.emoji) {
    return {
      type: "unicode",
      value: icon.emoji,
      name: icon.name ?? null,
    };
  }
  if (icon.type === "image" && icon.imageUrl) {
    return {
      type: "image",
      id: icon.id,
      url: icon.imageUrl,
      name: icon.name ?? null,
    };
  }
  return null;
}
