const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function telegramMarkupToHtml(raw: string) {
  const tokens: string[] = [];
  const token = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\u0000${index}\u0000`;
  };

  let value = raw.replace(
    /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g,
    (_match, language: string, code: string) => {
      const languageClass = language
        ? ` class="language-${escapeHtml(language)}"`
        : '';
      return token(`<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`);
    },
  );
  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  value = escapeHtml(value)
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<i>$1</i>')
    .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>')
    .replace(/\|\|([\s\S]+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');

  return value.replace(/\u0000(\d+)\u0000/g, (_match, index: string) =>
    tokens[Number(index)] ?? '',
  );
}
