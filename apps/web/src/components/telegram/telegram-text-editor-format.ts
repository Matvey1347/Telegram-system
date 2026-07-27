"use client";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function joinBlockSegments(segments: string[]) {
  return segments.join("\n").replace(/\n{3,}/g, "\n\n");
}

function blockquoteToEditorHtml(value: string) {
  const lines = value.split("\n");
  const blocks: string[] = [];
  let quoteType: "regular" | "expandable" | null = null;
  let quoteLines: string[] = [];
  let textLines: string[] = [];

  const flushText = () => {
    if (!textLines.length) return;
    blocks.push(textLines.join("\n"));
    textLines = [];
  };

  const flushQuote = () => {
    if (!quoteType) return;
    const attribute =
      quoteType === "expandable" ? ' data-expandable="true"' : "";
    blocks.push(
      `<blockquote${attribute}>${quoteLines.join("<br>")}</blockquote>`,
    );
    quoteType = null;
    quoteLines = [];
  };

  for (const line of lines) {
    const expandable = line.match(/^&gt;&gt;\s?(.*)$/);
    const regular = line.match(/^&gt;\s?(.*)$/);
    const nextType = expandable ? "expandable" : regular ? "regular" : null;
    if (!nextType) {
      flushQuote();
      textLines.push(line);
      continue;
    }
    flushText();
    if (quoteType && quoteType !== nextType) flushQuote();
    quoteType = nextType;
    quoteLines.push((expandable || regular)?.[1] || "");
  }

  flushQuote();
  flushText();

  return blocks
    .map((block) => {
      if (block.startsWith("<blockquote")) return block;
      return block
        .split("\n")
        .map((line) => (line.length ? `<div>${line}</div>` : "<div><br></div>"))
        .join("");
    })
    .join("");
}

export function telegramMarkupToEditorHtml(raw: string) {
  const normalizedRaw = raw.replace(/\r\n?/g, "\n");
  const tokens: string[] = [];
  const token = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\uE000${index}\uE001`;
  };

  let value = normalizedRaw.replace(
    /```([^\n`]*)\n?([\s\S]*?)```/g,
    (_match, language: string, code: string) => {
      const normalizedLanguage = language.trim();
      const languageAttr = normalizedLanguage
        ? ` data-language="${escapeHtml(normalizedLanguage)}"`
        : "";
      return token(
        `<pre${languageAttr}><code>${escapeHtml(code)}</code></pre>`,
      );
    },
  );

  value = value.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    token(`<code>${escapeHtml(code)}</code>`),
  );

  value = value.replace(
    /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
    (_match, label: string, postId: string) =>
      token(
        `<a href="tg-post:${escapeHtml(postId)}" data-internal-post-id="${escapeHtml(postId)}">${escapeHtml(label)}</a>`,
      ),
  );

  value = value.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s<>()]+)\)/gi,
    (_match, label: string, href: string) => {
      try {
        const url = new URL(href);
        if (!url.hostname.includes(".")) return _match;
        return token(
          `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
        );
      } catch {
        return _match;
      }
    },
  );

  value = escapeHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^\n]+?)__/g, "<em>$1</em>")
    .replace(/\+\+([^\n]+?)\+\+/g, "<u>$1</u>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    .replace(
      /\|\|([^\n]+?)\|\|/g,
      '<span data-telegram-spoiler="true">$1</span>',
    );

  const withBlocks = blockquoteToEditorHtml(value);

  return withBlocks.replace(
    /\uE000(\d+)\uE001/g,
    (_match, index: string) => tokens[Number(index)] ?? "",
  );
}

function normalizeTextNode(value: string) {
  return value.replace(/\u00a0/g, " ");
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (tag === "br") return "\n";

  if (tag === "strong" || tag === "b") {
    return `**${serializeChildren(element)}**`;
  }
  if (tag === "em" || tag === "i") {
    return `__${serializeChildren(element)}__`;
  }
  if (tag === "u") {
    return `++${serializeChildren(element)}++`;
  }
  if (tag === "s" || tag === "strike" || tag === "del") {
    return `~~${serializeChildren(element)}~~`;
  }
  if (
    tag === "span" &&
    (element.dataset.telegramSpoiler === "true" ||
      element.classList.contains("tg-spoiler"))
  ) {
    return `||${serializeChildren(element)}||`;
  }
  if (tag === "code" && element.parentElement?.tagName.toLowerCase() !== "pre") {
    return `\`${serializeChildren(element)}\``;
  }
  if (tag === "a") {
    const label = serializeChildren(element) || "link";
    const internalPostId = element.dataset.internalPostId;
    if (internalPostId) return `[${label}](tg-post:${internalPostId})`;
    const href = element.getAttribute("href") || "";
    return href ? `[${label}](${href})` : label;
  }
  if (tag === "pre") {
    const language = element.dataset.language?.trim() || "";
    const codeElement = element.querySelector("code");
    const rawCode = normalizeTextNode(codeElement?.textContent || element.textContent || "");
    return `\`\`\`${language}\n${rawCode}\`\`\`\n`;
  }
  if (tag === "blockquote") {
    const prefix =
      element.dataset.expandable === "true" ||
      element.classList.contains("expandable")
        ? ">> "
        : "> ";
    const lines = serializeChildren(element)
      .replace(/\n{3,}/g, "\n\n")
      .split("\n");
    return `${lines.map((line) => `${prefix}${line}`).join("\n")}\n`;
  }
  if (tag === "div" || tag === "p") {
    return `${serializeChildren(element)}\n`;
  }

  return serializeChildren(element);
}

function serializeChildren(element: HTMLElement) {
  return Array.from(element.childNodes)
    .map((node) => serializeNode(node))
    .join("");
}

export function editorHtmlToTelegramMarkup(html: string) {
  if (typeof document === "undefined") return "";
  const container = document.createElement("div");
  container.innerHTML = html;

  const serialized = Array.from(container.childNodes)
    .map((node) => serializeNode(node))
    .join("");

  return joinBlockSegments(
    serialized
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, "")),
  ).trimEnd();
}
