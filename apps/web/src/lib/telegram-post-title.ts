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
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/^([*_~`+]+)(.*)\1$/u, "$2")
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
