export const INTERNAL_POST_LINK_SCHEME = 'tg-post:';

export const INTERNAL_POST_LINK_REGEX =
  /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g;

export function extractInternalPostLinkIds(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(INTERNAL_POST_LINK_REGEX)].map((match) => match[2]),
    ),
  ];
}

export function replaceInternalPostLinks(
  text: string,
  urlsByPostId: Map<string, string>,
): string {
  return text.replace(
    INTERNAL_POST_LINK_REGEX,
    (match, label: string, postId: string) => {
      const url = urlsByPostId.get(postId);
      return url ? `[${label}](${url})` : match;
    },
  );
}
