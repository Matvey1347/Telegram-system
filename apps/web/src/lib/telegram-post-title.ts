export type AutoPrefilledPostTitle = {
  emoji: string | null;
  title: string;
};

const titleSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(value: string) {
  if (!value) return [];
  if (!titleSegmenter) return Array.from(value);
  return Array.from(
    titleSegmenter.segment(value),
    (segment) => segment.segment,
  );
}

function isEmojiGrapheme(value: string) {
  return /\p{Extended_Pictographic}/u.test(value);
}

function stripLineFormatting(value: string) {
  let normalized = value
    .trim()
    .replace(/^```+\w*\s*/u, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim();

  let previous = "";
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^#{1,6}\s+/u, "")
      .replace(/^>\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^(\*\*|__|~~|`)([\s\S]*)\1$/u, "$2")
      .replace(/^(\*\*|__|~~|`)+/u, "")
      .replace(/(\*\*|__|~~|`)+$/u, "")
      .trim();
  }

  return normalized
    .replace(/(\*\*|__|~~|`)/gu, "")
    .trim();
}

export function extractAutoPrefilledPostTitle(
  text: string,
): AutoPrefilledPostTitle | null {
  const firstMeaningfulLine = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => stripLineFormatting(line))
    .find((line) => line.length > 0);

  if (!firstMeaningfulLine) return null;

  const graphemes = splitGraphemes(firstMeaningfulLine);
  let start = 0;
  let end = graphemes.length;
  let emoji: string | null = null;

  while (start < end && graphemes[start]?.trim() === "") start += 1;
  while (end > start && graphemes[end - 1]?.trim() === "") end -= 1;

  if (start < end && isEmojiGrapheme(graphemes[start])) {
    emoji = graphemes[start];
    start += 1;
    while (start < end && /[\s\-–—:|]/u.test(graphemes[start] || ""))
      start += 1;
  } else if (end > start && isEmojiGrapheme(graphemes[end - 1])) {
    emoji = graphemes[end - 1];
    end -= 1;
    while (end > start && /[\s\-–—:|]/u.test(graphemes[end - 1] || ""))
      end -= 1;
  }

  const title = graphemes.slice(start, end).join("").trim();
  if (!title) return null;

  return {
    emoji,
    title,
  };
}
