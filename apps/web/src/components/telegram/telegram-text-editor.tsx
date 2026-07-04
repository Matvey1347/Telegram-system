"use client";

import {
  Bold,
  Braces,
  Code,
  EyeOff,
  Italic,
  Link as LinkIcon,
  Quote,
  Strikethrough,
  Underline,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useRef,
  useState,
} from "react";

type TelegramTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
};

type WrapAction = {
  label: string;
  icon: typeof Bold;
  before: string;
  after: string;
  placeholder: string;
};

type EditorSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const actions: WrapAction[] = [
  { label: "Bold", icon: Bold, before: "**", after: "**", placeholder: "bold text" },
  { label: "Italic", icon: Italic, before: "__", after: "__", placeholder: "italic text" },
  { label: "Underline", icon: Underline, before: "++", after: "++", placeholder: "underlined text" },
  { label: "Strikethrough", icon: Strikethrough, before: "~~", after: "~~", placeholder: "strikethrough text" },
  { label: "Spoiler", icon: EyeOff, before: "||", after: "||", placeholder: "hidden text" },
  { label: "Inline code", icon: Code, before: "`", after: "`", placeholder: "code" },
];

export function TelegramTextEditor({
  value,
  onChange,
  disabled,
  rows = 12,
}: TelegramTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linkSelectionRef = useRef({ start: 0, end: 0 });
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const lastKnownValueRef = useRef(value);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");

  if (lastKnownValueRef.current !== value) {
    lastKnownValueRef.current = value;
    undoStackRef.current = [];
    redoStackRef.current = [];
  }

  const currentSnapshot = (): EditorSnapshot => {
    const textarea = textareaRef.current;
    return {
      value,
      selectionStart: textarea?.selectionStart ?? value.length,
      selectionEnd: textarea?.selectionEnd ?? value.length,
    };
  };

  const restoreSelection = (start: number, end = start) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  };

  const commitValue = (
    nextValue: string,
    nextSelectionStart?: number,
    nextSelectionEnd = nextSelectionStart,
  ) => {
    if (nextValue === value) return;
    undoStackRef.current.push(currentSnapshot());
    redoStackRef.current = [];
    lastKnownValueRef.current = nextValue;
    onChange(nextValue);
    if (nextSelectionStart !== undefined) {
      restoreSelection(nextSelectionStart, nextSelectionEnd);
    }
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(currentSnapshot());
    lastKnownValueRef.current = previous.value;
    onChange(previous.value);
    restoreSelection(previous.selectionStart, previous.selectionEnd);
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(currentSnapshot());
    lastKnownValueRef.current = next.value;
    onChange(next.value);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const replaceSelection = (
    before: string,
    after: string,
    placeholder: string,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = value.slice(start, end);
    const content = selection || placeholder;
    const isWrapped =
      start >= before.length &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after;
    if (isWrapped) {
      const nextValue = `${value.slice(0, start - before.length)}${content}${value.slice(end + after.length)}`;
      const selectionStart = start - before.length;
      commitValue(
        nextValue,
        selectionStart,
        selectionStart + content.length,
      );
      return;
    }
    const nextValue = `${value.slice(0, start)}${before}${content}${after}${value.slice(end)}`;
    const selectionStart = start + before.length;
    commitValue(nextValue, selectionStart, selectionStart + content.length);
  };

  const prefixLines = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLine = value.indexOf("\n", end);
    const lineEnd = nextLine === -1 ? value.length : nextLine;
    const selectedLines = value.slice(lineStart, lineEnd) || "Quote";
    const replacement = selectedLines
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    commitValue(
      `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
      lineStart,
      lineStart + replacement.length,
    );
  };

  const insertLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    linkSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    setLinkUrl("https://");
    setLinkError("");
    setLinkEditorOpen(true);
  };

  const applyLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { start, end } = linkSelectionRef.current;
    const selected = value.slice(start, end) || "link text";
    let normalizedHref: string;
    try {
      const url = new URL(linkUrl.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname.includes(".")
      ) {
        throw new Error("Invalid URL");
      }
      normalizedHref = url.toString();
    } catch {
      setLinkError("Enter a full URL, for example: https://example.com");
      return;
    }
    const markup = `[${selected}](${normalizedHref})`;
    commitValue(
      `${value.slice(0, start)}${markup}${value.slice(end)}`,
      start,
      start + markup.length,
    );
    setLinkEditorOpen(false);
    setLinkError("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === "y") {
      event.preventDefault();
      redo();
    } else if (key === "b") {
      event.preventDefault();
      replaceSelection("**", "**", "bold text");
    } else if (key === "i") {
      event.preventDefault();
      replaceSelection("__", "__", "italic text");
    } else if (key === "k") {
      event.preventDefault();
      insertLink();
    }
  };

  return (
    <div className="relative overflow-visible rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-700 bg-neutral-950/70 p-2">
        {actions.map(({ label, icon: Icon, before, after, placeholder }) => (
          <EditorButton
            key={label}
            label={label}
            icon={Icon}
            disabled={disabled}
            onClick={() => replaceSelection(before, after, placeholder)}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-neutral-700" />
        <EditorButton
          label="Code block"
          icon={Braces}
          disabled={disabled}
          onClick={() => replaceSelection("```\n", "\n```", "code block")}
        />
        <EditorButton
          label="Quote"
          icon={Quote}
          disabled={disabled}
          onClick={() => prefixLines("> ")}
        />
        <EditorButton
          label="Insert link"
          icon={LinkIcon}
          disabled={disabled}
          onClick={insertLink}
        />
      </div>
      {linkEditorOpen ? (
        <div className="absolute left-2 right-2 top-12 z-30 rounded-lg border border-neutral-700 bg-neutral-950 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-white">Insert link</p>
            <button
              type="button"
              onClick={() => setLinkEditorOpen(false)}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              aria-label="Close link editor"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              type="url"
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === "Escape") setLinkEditorOpen(false);
              }}
              placeholder="https://example.com"
              className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Add
            </button>
          </div>
          {linkError ? (
            <p className="mt-2 text-xs text-red-400">{linkError}</p>
          ) : null}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(event) => commitValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write your Telegram post…"
        className="block w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-500 disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
        <span>⌘/Ctrl+Z undo · ⌘/Ctrl+Shift+Z or Ctrl+Y redo · ⌘/Ctrl+B bold · ⌘/Ctrl+I italic · ⌘/Ctrl+K link</span>
        <span>{value.length} characters</span>
      </div>
    </div>
  );
}

function EditorButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  badge,
}: {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:opacity-40"
    >
      <Icon size={16} />
      {badge ? (
        <span className="absolute bottom-0.5 right-0.5 text-[9px] font-bold">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
