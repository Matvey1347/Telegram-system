"use client";

import { ChevronRight, Eye, MessageCircle, Send } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";

type TelegramPostPreviewProps = {
  channelTitle: string;
  channelPhotoUrl?: string | null;
  text: string;
  imageUrls: string[];
  longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function previewHtml(raw: string) {
  const tokens: string[] = [];
  const token = (html: string) => {
    const index = tokens.push(html) - 1;
    return `\u0000${index}\u0000`;
  };
  let value = raw.replace(
    /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g,
    (_match, language: string, code: string) => {
      const label = language || "copy";
      const escapedCode = escapeHtml(code);
      return token(
        `<pre class="tg-code-block"><span class="tg-code-header"><span>${escapeHtml(label)}</span><button type="button" data-copy-code aria-label="Copy code"><svg class="tg-copy-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="2.5" width="10" height="12" rx="1.8"></rect><rect x="3.5" y="5.5" width="10" height="12" rx="1.8"></rect></svg></button></span><code>${escapedCode}</code></pre>`,
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
        if (!url.hostname.includes(".")) return _match;
        return token(
          `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`,
        );
      } catch {
        return _match;
      }
    },
  );
  value = value.replace(
    /https?:\/\/[^\s<>()\u0000]+/gi,
    (href: string) => {
      try {
        const url = new URL(href);
        if (!url.hostname.includes(".")) return href;
        return token(
          `<a href="${escapeHtml(url.toString())}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a>`,
        );
      } catch {
        return href;
      }
    },
  );
  value = escapeHtml(value)
    .replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n]+?)__/g, "<i>$1</i>")
    .replace(/\+\+([^\n]+?)\+\+/g, "<u>$1</u>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    .replace(/\|\|([^\n]+?)\|\|/g, '<span class="tg-spoiler">$1</span>');

  const lines = value.split("\n");
  const rendered: string[] = [];
  let quoteType: "regular" | "expandable" | null = null;
  let quoteLines: string[] = [];
  const flush = () => {
    if (!quoteType) return;
    rendered.push(
      `<blockquote${quoteType === "expandable" ? ' class="expandable"' : ""}>${quoteLines.join("<br>")}</blockquote>`,
    );
    quoteType = null;
    quoteLines = [];
  };
  for (const line of lines) {
    const expandable = line.match(/^&gt;&gt;\s?(.*)$/);
    const regular = line.match(/^&gt;\s?(.*)$/);
    const nextType = expandable ? "expandable" : regular ? "regular" : null;
    if (!nextType) {
      flush();
      rendered.push(line);
      continue;
    }
    if (quoteType && quoteType !== nextType) flush();
    quoteType = nextType;
    quoteLines.push((expandable || regular)?.[1] || "");
  }
  flush();
  return rendered
    .join("\n")
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => tokens[Number(index)] || "");
}

export function TelegramPostPreview({
  channelTitle,
  channelPhotoUrl,
  text,
  imageUrls,
  longTextMode = "IMAGES_THEN_TEXT",
}: TelegramPostPreviewProps) {
  const hasContent = text.trim() || imageUrls.length;
  const time = new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const messages =
    imageUrls.length && text.length > 1024
      ? longTextMode === "CAPTION_THEN_TEXT"
        ? (() => {
            const [caption, remainder] = splitPreviewText(text);
            return [
              { text: caption, imageUrls },
              ...(remainder ? [{ text: remainder, imageUrls: [] }] : []),
            ];
          })()
        : [
            { text: "", imageUrls },
            { text, imageUrls: [] },
          ]
      : [{ text, imageUrls }];

  return (
    <aside className="min-w-0">
      <div className="sticky top-4 overflow-hidden rounded-xl border border-[#263849] bg-[#0e1621] shadow-xl">
        <div className="flex items-center gap-3 border-b border-[#263849] bg-[#17212b] px-4 py-3">
          <TelegramEntityAvatar
            imageUrl={channelPhotoUrl}
            kind="channel"
            alt={channelTitle}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {channelTitle}
            </p>
            <p className="text-xs text-[#7f91a4]">channel</p>
          </div>
        </div>

        <div className="telegram-preview-wallpaper min-h-[460px] px-3 py-5">
          <div className="mx-auto mb-4 w-fit rounded-full bg-[#182533]/90 px-3 py-1 text-[11px] font-medium text-white shadow">
            Today
          </div>
          {hasContent ? (
            <div className="relative max-w-[94%] space-y-2">
              {messages.map((message, index) => (
                <TelegramMessageBubble
                  key={`${index}-${message.text.length}-${message.imageUrls.length}`}
                  text={message.text}
                  imageUrls={message.imageUrls}
                  time={time}
                />
              ))}
              <Send
                size={22}
                className="absolute -right-8 bottom-2 fill-[#40a7e3] text-[#40a7e3]"
              />
            </div>
          ) : (
            <div className="flex min-h-[400px] items-center justify-center px-8 text-center text-sm text-[#708499]">
              Start typing or upload images to preview your Telegram post.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function TelegramMessageBubble({
  text,
  imageUrls,
  time,
}: {
  text: string;
  imageUrls: string[];
  time: string;
}) {
  return (
    <div className="telegram-message-bubble overflow-hidden rounded-[18px] rounded-bl-[5px] bg-[#182533] shadow-md">
      {imageUrls.length ? <TelegramMediaGrid imageUrls={imageUrls} /> : null}
      {text.trim() ? (
        <div className="px-3.5 pb-2.5 pt-3">
          <div
            className="telegram-preview-text whitespace-pre-wrap break-words text-[14px] leading-[1.42] text-[#f5f5f5]"
            dangerouslySetInnerHTML={{ __html: previewHtml(text) }}
            onClick={handlePreviewContentClick}
          />
          <MessageMeta time={time} />
        </div>
      ) : (
        <div className="px-3 py-1.5">
          <MessageMeta time={time} />
        </div>
      )}
      <div className="flex items-center justify-between border-t border-[#324557] px-3.5 py-2.5 text-[13px] text-[#40a7e3]">
        <span className="flex items-center gap-2">
          <MessageCircle size={17} />
          Leave a Comment
        </span>
        <ChevronRight size={18} />
      </div>
    </div>
  );
}

function MessageMeta({ time }: { time: string }) {
  return (
    <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#9fb0c0]">
      <Eye size={12} />
      <span>1</span>
      <span>{time}</span>
    </div>
  );
}

function handlePreviewContentClick(event: React.MouseEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  const copyButton = target.closest("[data-copy-code]");
  if (copyButton) {
    event.preventDefault();
    const code = copyButton
      .closest(".tg-code-block")
      ?.querySelector("code")
      ?.textContent;
    if (code) {
      void navigator.clipboard.writeText(code);
      copyButton.classList.add("copied");
      window.setTimeout(() => copyButton.classList.remove("copied"), 1200);
    }
    return;
  }
  const spoiler = target.closest(".tg-spoiler");
  if (spoiler) {
    event.preventDefault();
    spoiler.classList.toggle("revealed");
  }
}

function splitPreviewText(rawText: string): [string, string] {
  const boundaries = new Set<number>();
  for (const match of rawText.matchAll(/\n\s*\n/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  for (const match of rawText.matchAll(/\n|\s+/g)) {
    boundaries.add((match.index || 0) + match[0].length);
  }
  const splitAt = [...boundaries]
    .sort((a, b) => b - a)
    .find((position) => {
      const candidate = rawText.slice(0, position).trimEnd();
      return (
        candidate.length <= 1024 &&
        hasBalancedPreviewMarkup(candidate)
      );
    });
  if (!splitAt) return ["", rawText];
  return [
    rawText.slice(0, splitAt).trimEnd(),
    rawText.slice(splitAt).trimStart(),
  ];
}

function hasBalancedPreviewMarkup(value: string) {
  if ((value.match(/```/g) || []).length % 2 !== 0) return false;
  const withoutFenced = value.replace(/```[\s\S]*?```/g, "");
  if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
  return ["**", "__", "++", "~~", "||"].every((marker) => {
    let count = 0;
    let cursor = 0;
    while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
      count += 1;
      cursor += marker.length;
    }
    return count % 2 === 0;
  });
}

function TelegramMediaGrid({ imageUrls }: { imageUrls: string[] }) {
  const visible = imageUrls.slice(0, 4);
  return (
    <div
      className={`grid gap-0.5 bg-[#0e1621] ${
        visible.length === 1
          ? "grid-cols-1"
          : "grid-cols-2"
      }`}
    >
      {visible.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={`relative overflow-hidden bg-black ${
            visible.length === 1
              ? "aspect-[4/3]"
              : visible.length === 3 && index === 0
                ? "row-span-2 aspect-auto min-h-56"
                : "aspect-square"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-contain" />
          {index === 3 && imageUrls.length > 4 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
              +{imageUrls.length - 4}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
