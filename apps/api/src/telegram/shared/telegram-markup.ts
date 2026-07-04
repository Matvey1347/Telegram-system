import { parseTelegramSpoilers } from '@telegram-system/shared/telegram-spoilers';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function convertBlockquotes(value: string) {
  const lines = value.split('\n');
  const output: string[] = [];
  let quoteType: 'regular' | 'expandable' | null = null;
  let quoteLines: string[] = [];

  const flush = () => {
    if (!quoteType) return;
    const attribute = quoteType === 'expandable' ? ' expandable' : '';
    output.push(
      `<blockquote${attribute}>${quoteLines.join('\n')}</blockquote>`,
    );
    quoteType = null;
    quoteLines = [];
  };

  for (const line of lines) {
    const expandable = line.match(/^&gt;&gt;\s?(.*)$/);
    const regular = line.match(/^&gt;\s?(.*)$/);
    const nextType = expandable ? 'expandable' : regular ? 'regular' : null;
    if (!nextType) {
      flush();
      output.push(line);
      continue;
    }
    if (quoteType && quoteType !== nextType) flush();
    quoteType = nextType;
    quoteLines.push((expandable || regular)?.[1] || '');
  }
  flush();
  return output.join('\n');
}

export function telegramMarkupToHtml(raw: string) {
  const tokens: string[] = [];
  const token = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\uE000${index}\uE001`;
  };

  let value = raw.replace(
    /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g,
    (_match, language: string, code: string) => {
      const languageClass = language
        ? ` class="language-${escapeHtml(language)}"`
        : '';
      return token(
        `<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`,
      );
    },
  );
  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );
  value = value.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s<>()]+)\)/gi,
    (_match, label: string, href: string) => {
      try {
        const url = new URL(href);
        if (
          (url.protocol !== 'http:' && url.protocol !== 'https:') ||
          !url.hostname.includes('.')
        ) {
          return _match;
        }
        return token(
          `<a href="${escapeHtml(url.toString())}">${escapeHtml(label)}</a>`,
        );
      } catch {
        return _match;
      }
    },
  );
  const spoilers = parseTelegramSpoilers(value);
  value = spoilers.text;
  for (const entity of [...spoilers.entities].reverse()) {
    const end = entity.offset + entity.length;
    value = value.slice(0, end) + token('</tg-spoiler>') + value.slice(end);
    value =
      value.slice(0, entity.offset) +
      token('<tg-spoiler>') +
      value.slice(entity.offset);
  }
  value = escapeHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^\n]+?)__/g, '<i>$1</i>')
    .replace(/\+\+([^\n]+?)\+\+/g, '<u>$1</u>')
    .replace(/~~([^\n]+?)~~/g, '<s>$1</s>');

  return convertBlockquotes(value).replace(
    /\uE000(\d+)\uE001/g,
    (_match, index: string) => tokens[Number(index)] ?? '',
  );
}

export function telegramHtmlToMtprotoHtml(html: string) {
  return html.replace(/<\/?tg-spoiler>/g, (tag) =>
    tag.startsWith('</') ? '</spoiler>' : '<spoiler>',
  );
}
