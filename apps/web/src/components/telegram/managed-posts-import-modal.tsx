"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileUp,
  ListChecks,
  LoaderCircle,
} from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  buildManagedPostInternalLinks,
  ManagedPostInternalLinksNotice,
} from "@/components/telegram/managed-post-internal-links-notice";
import {
  TelegramTextEditor,
  type TelegramTextEditorHandle,
} from "@/components/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostsImportResult,
  type TelegramManagedPostsImportRow,
  type ResolvedEmoji,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

const noGroupValue = "__no_group__";
const gptImportPromptFormat = `Ask GPT to return only a JSON array. Each array item is one post:

[
  {
    "title": "Post title",
    "text": "Telegram-ready post text",
    "icon": "🔥",
    "urls": ["https://example.com/1.png"],
    "groupPosition": null,
    "imageSearch": [
      "mountain rest",
      "quiet lake",
      "empty viewpoint"
    ]
  }
]

Required: \`title\`. Optional: \`text\`, \`icon\`, \`urls\`, \`groupPosition\`, \`imageSearch\`. \`imageSearch\` is shown only in this import preview for easy copying and is not saved to posts. Put the whole post body in \`text\`; do not split one post into several objects. CSV/TSV still works, including multiline quoted text, but JSON is safer for generated posts.`;

function apiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = apiError.response?.data?.message;
  return Array.isArray(message)
    ? message.join(", ")
    : message || apiError.message || fallback;
}

function detectDelimiter(content: string, fileName?: string | null) {
  const lowerFileName = fileName?.toLocaleLowerCase() ?? "";
  if (lowerFileName.endsWith(".tsv")) return "\t";
  if (lowerFileName.endsWith(".csv")) return ",";
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(",")) return ",";
  return null;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.replace(/\r/g, "").trim());
}

function parseDelimitedRecords(content: string, delimiter: string) {
  const records: string[][] = [];
  let current = "";
  let inQuotes = false;
  let recordHasContent = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      current += char;
      recordHasContent = true;
      if (inQuotes && next === '"') {
        current += next;
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      if (recordHasContent || current.trim()) {
        records.push(parseDelimitedLine(current, delimiter));
      }
      current = "";
      recordHasContent = false;
      continue;
    }

    current += char;
    if (!/\s/.test(char)) {
      recordHasContent = true;
    }
  }

  if (recordHasContent || current.trim()) {
    records.push(parseDelimitedLine(current, delimiter));
  }

  return records;
}

function parseDelimitedRows(content: string, delimiter: string) {
  const records = parseDelimitedRecords(content, delimiter);
  if (!records.length) return [];

  const headerCells = records[0].map((cell) => cell.toLocaleLowerCase());
  const hasHeader = headerCells.some((cell) =>
    [
      "title",
      "text",
      "icon",
      "emoji",
      "icontext",
      "urls",
      "imagesearch",
      "groupposition",
      "order",
    ].includes(cell.replace(/\s+/g, "")),
  );

  const headers = hasHeader
    ? headerCells
    : ["title", "text", "urls", "icon", "groupposition"];
  const startIndex = hasHeader ? 1 : 0;

  return records.slice(startIndex).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header.replace(/\s+/g, "")] = cells[index] ?? "";
    });
    return row;
  });
}

function parsePlainTextRows(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const [title = "", ...rest] = lines;
      const urlLines = rest.filter((line) => /^urls?:/i.test(line));
      const bodyLines = rest.filter((line) => !/^urls?:/i.test(line));
      const urls = urlLines
        .flatMap((line) => line.replace(/^urls?:/i, "").split(/[,\s]+/))
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        title,
        text: bodyLines.join("\n"),
        urls,
      };
    });
}

type ParsedImportRow = Record<string, unknown>;

type EditableImportRow = {
  title: string;
  text: string;
  icon: string;
  urlsText: string;
  imageSearchText: string;
  groupPosition: string;
  order: string;
};

function importValueToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isEmojiLikeIcon(value: string) {
  return /\p{Extended_Pictographic}/u.test(value);
}

function importIconPresentation(value: string): ResolvedEmoji | null {
  const icon = value.trim();
  if (!icon || !isEmojiLikeIcon(icon)) return null;
  return { type: "unicode", value: icon, name: icon };
}

function cleanRepeatedMarkdownLinks(value: string) {
  return value.replace(
    /\[\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\]\(\2\)/gi,
    "[$1]($2)",
  );
}

function cleanImportImageUrl(value: string) {
  let nextValue = value.trim().replace(/^["']|["']$/g, "");
  const markdownLink = nextValue.match(/\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownLink?.[1]) {
    nextValue = markdownLink[1];
  }
  const bareUrl = nextValue.match(/https?:\/\/[^\s"',\])]+/i);
  return bareUrl?.[0] ?? nextValue;
}

function importUrlsToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => importUrlsToArray(item))
      .map(cleanImportImageUrl)
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,]+/)
    .map(cleanImportImageUrl)
    .filter(Boolean);
}

function importImageSearchToArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => importImageSearchToArray(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function urlsTextToArray(value: string) {
  return value
    .split(/\r?\n/)
    .map(cleanImportImageUrl)
    .filter(Boolean);
}

export function rowToEditable(
  row: TelegramManagedPostsImportRow,
): EditableImportRow {
  const icon =
    importValueToString(row.icon) ||
    importValueToString(row.emoji) ||
    importValueToString(row.iconText);

  return {
    title: cleanRepeatedMarkdownLinks(importValueToString(row.title)),
    text: cleanRepeatedMarkdownLinks(importValueToString(row.text)),
    icon,
    urlsText: importUrlsToArray(row.urls ?? row.imageUrls ?? row.images).join(
      "\n",
    ),
    imageSearchText: importImageSearchToArray(row.imageSearch).join("\n"),
    groupPosition: importValueToString(row.groupPosition),
    order: importValueToString(row.order),
  };
}

export function editableRowToImportRow(
  row: EditableImportRow,
): TelegramManagedPostsImportRow {
  return {
    title: row.title,
    text: row.text,
    icon: row.icon,
    urls: urlsTextToArray(row.urlsText),
    groupPosition: row.groupPosition || null,
    order: row.order || undefined,
  };
}

export function editableRowsToJsonContent(rows: EditableImportRow[]) {
  return JSON.stringify(
    rows.map((row) => {
      const imageSearch = importImageSearchToArray(row.imageSearchText);
      return {
        title: row.title,
        text: row.text,
        icon: row.icon,
        urls: urlsTextToArray(row.urlsText),
        groupPosition: row.groupPosition || null,
        ...(imageSearch.length ? { imageSearch } : {}),
      };
    }),
    null,
    2,
  );
}

function parseJsonRows(content: string): ParsedImportRow[] | null {
  const trimmed = content.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is ParsedImportRow =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if ("title" in parsed || "text" in parsed) {
        return [parsed as ParsedImportRow];
      }
      const rows = (parsed as { posts?: unknown }).posts;
      if (Array.isArray(rows)) {
        return rows.filter(
          (item): item is ParsedImportRow =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        );
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeImportRows(
  content: string,
  fileName?: string | null,
): TelegramManagedPostsImportRow[] {
  const jsonRows = parseJsonRows(content);
  if (jsonRows) {
    return jsonRows.map((row) => ({
      title: row.title,
      text: row.text,
      icon: row.icon,
      emoji: row.emoji,
      iconText: row.icontext ?? row.iconText,
      urls: row.urls ?? row.imageUrls ?? row.images,
      imageSearch: row.imagesearch ?? row.imageSearch,
      groupPosition: row.groupposition ?? row.groupPosition,
      order: row.order,
    }));
  }

  const delimiter = detectDelimiter(content, fileName);
  const rows: ParsedImportRow[] = (
    delimiter
      ? parseDelimitedRows(content, delimiter)
      : parsePlainTextRows(content)
  ) as ParsedImportRow[];

  return rows.map((row) => ({
    title: row.title,
    text: row.text,
    icon: row.icon,
    emoji: row.emoji,
    iconText: row.icontext ?? row.iconText,
    urls: row.urls ?? row.imageUrls ?? row.images,
    imageSearch: row.imagesearch ?? row.imageSearch,
    groupPosition: row.groupposition ?? row.groupPosition,
    order: row.order,
  }));
}

function summarizeResult(result: TelegramManagedPostsImportResult | null) {
  if (!result) {
    return { created: 0, skipped: 0, errors: 0 };
  }
  return {
    created: result.createdCount,
    skipped: result.skippedCount,
    errors: result.rows.filter((row) => row.status === "skipped").length,
  };
}

export function ManagedPostsImportModal({
  open,
  onClose,
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelTelegramChatId,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle?: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
}) {
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const textEditorRef = useRef<TelegramTextEditorHandle | null>(null);
  const [postGroupId, setPostGroupId] = useState(noGroupValue);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [importing, setImporting] = useState(false);
  const [editableRows, setEditableRows] = useState<EditableImportRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [highlightedInternalLinkTargetId, setHighlightedInternalLinkTargetId] =
    useState<string | null>(null);
  const [highlightRequestKey, setHighlightRequestKey] = useState(0);
  const [result, setResult] = useState<TelegramManagedPostsImportResult | null>(
    null,
  );

  const postGroups = useQuery({
    queryKey: telegramPostKeys.postGroups(channelId),
    queryFn: () =>
      telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
    enabled: open && Boolean(channelId),
  });

  const managedPosts = useQuery({
    queryKey: telegramPostKeys.managed(channelId),
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
    enabled: open && Boolean(channelId),
  });

  const groupOptions = useMemo(
    () => [
      { value: noGroupValue, label: "No group" },
      ...(postGroups.data ?? []).map((group) => {
        const presentation = group.iconPresentation;
        return {
          value: group.id,
          label: group.title,
          iconEmoji:
            presentation?.type === "unicode"
              ? presentation.value
              : undefined,
          iconUrl:
            presentation?.type === "image"
              ? presentation.url
              : undefined,
          iconFallback: group.title,
        };
      }),
    ],
    [postGroups.data],
  );

  const importRows = useMemo(
    () => editableRows.map(editableRowToImportRow),
    [editableRows],
  );
  const selectedRow = editableRows[selectedRowIndex] ?? null;
  const selectedIconPresentation = importIconPresentation(
    selectedRow?.icon ?? "",
  );
  const selectedIconId =
    selectedRow?.icon && !selectedIconPresentation ? selectedRow.icon : null;
  const selectedImageUrls = useMemo(
    () => (selectedRow ? urlsTextToArray(selectedRow.urlsText) : []),
    [selectedRow],
  );
  const selectedImageSearchQueries = useMemo(
    () =>
      selectedRow
        ? importImageSearchToArray(selectedRow.imageSearchText)
        : [],
    [selectedRow],
  );
  const selectedOutgoingInternalLinks = useMemo(
    () =>
      selectedRow
        ? buildManagedPostInternalLinks(selectedRow.text, managedPosts.data)
        : [],
    [managedPosts.data, selectedRow],
  );
  const canImport = Boolean(channelId) && importRows.length > 0;
  const resultSummary = summarizeResult(result);
  const skippedRows =
    result?.rows.filter((row) => row.status === "skipped") ?? [];

  const updateEditableRow = (
    index: number,
    patch: Partial<EditableImportRow>,
  ) => {
    setResult(null);
    setEditableRows((rows) => {
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      );
      setContent(editableRowsToJsonContent(nextRows));
      setFileName(null);
      return nextRows;
    });
  };

  const applyImportContent = (
    nextContent: string,
    nextFileName: string | null,
  ) => {
    setContent(nextContent);
    setFileName(nextFileName);
    setEditableRows(
      normalizeImportRows(nextContent, nextFileName).map(rowToEditable),
    );
    setSelectedRowIndex(0);
    setResult(null);
  };

  const runImport = async () => {
    const operation = startOperation({
      id: `managed-post-import:${channelId}`,
      title: "Import posts",
      message: "Starting import...",
      current: 0,
      total: importRows.length,
    });
    setImporting(true);
    try {
      const nextResult = await telegramChannelsApi.importManagedPostsWithProgress(
        channelId,
        {
          postGroupId: postGroupId === noGroupValue ? null : postGroupId,
          rows: importRows,
        },
        (item, current, total) => {
          operation.update({
            message: item.message,
            current,
            total,
          });
        },
      );
      setResult(nextResult);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managed(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedCalendar(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.linkTargets(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.postGroups(channelId),
        }),
      ]);
      const nextSummary = summarizeResult(nextResult);
      operation.succeed({
        message: `Imported ${nextSummary.created} posts. Skipped ${nextSummary.skipped}. Errors ${nextSummary.errors}.`,
      });
      pushToast(
        `Imported ${nextSummary.created} posts. Skipped ${nextSummary.skipped}. Errors ${nextSummary.errors}.`,
        nextSummary.errors ? "info" : "success",
        5000,
      );
    } catch (error) {
      const message = apiErrorMessage(error, "Could not import managed posts");
      setLocalError(message);
      operation.fail({ message });
    } finally {
      setImporting(false);
    }
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setLocalError("");
    applyImportContent(await file.text(), file.name);
  };

  const close = () => {
    setLocalError("");
    setResult(null);
    onClose();
  };

  const submit = () => {
    setLocalError("");
    setResult(null);
    if (!importRows.length) {
      setLocalError("Paste rows or upload a JSON, CSV, TSV, or TXT file first.");
      return;
    }
    void runImport();
  };

  const copyImageSearchQuery = async (query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      pushToast("Image search query copied.", "success");
    } catch {
      pushToast("Could not copy image search query.", "error");
    }
  };

  const copyPromptFormat = async () => {
    try {
      await navigator.clipboard.writeText(gptImportPromptFormat);
      pushToast("GPT prompt format copied.", "success");
    } catch {
      pushToast("Could not copy GPT prompt format.", "error");
    }
  };

  const highlightInternalLinkTarget = (targetId: string) => {
    setHighlightedInternalLinkTargetId(targetId);
    setHighlightRequestKey((current) => current + 1);
  };

  return (
    <Modal open={open} onClose={close} title="Import managed posts" size="xl">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            void copyPromptFormat();
          }}
          className="group flex w-full items-center justify-between gap-3 rounded-lg border border-blue-800/60 bg-blue-950/20 p-2.5 text-left text-blue-100 transition hover:border-blue-600 hover:bg-blue-950/35"
          title="Copy GPT prompt format"
        >
          <div className="inline-flex min-w-0 items-center gap-2 text-sm font-medium">
            <ClipboardList size={15} className="shrink-0" />
            <span className="truncate">GPT prompt format</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-blue-800/60 bg-neutral-950/70 px-2 py-1 text-[11px] text-blue-100/80 group-hover:text-white">
            <Copy size={12} />
            Copy
          </span>
        </button>

        <FormField label="Post group">
          <CustomSelect
            value={postGroupId}
            onChange={setPostGroupId}
            options={groupOptions}
            disabled={postGroups.isLoading || importing}
            placeholder={
              postGroups.isLoading ? "Loading groups..." : "Select group"
            }
          />
          {postGroups.error ? (
            <p className="mt-1 text-xs text-amber-300">
              Could not load post groups. Import can still create ungrouped
              posts.
            </p>
          ) : null}
        </FormField>

        <FormField label="Upload file">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950 px-3 py-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white">
            <FileUp size={18} />
            <span className="truncate">
              {fileName ? fileName : "Choose JSON, CSV, TSV, or TXT"}
            </span>
            <input
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </FormField>

        <FormField label="Paste import data">
          <Textarea
            value={content}
            onChange={(event) => {
              applyImportContent(event.target.value, null);
            }}
            rows={10}
            disabled={importing}
            placeholder="Paste JSON, CSV, TSV, or plain text posts here."
            className="font-mono text-xs"
          />
        </FormField>

        <div className="grid gap-2 sm:grid-cols-4">
          <ImportStat label="Parsed rows" value={editableRows.length} />
          <ImportStat
            label="Created"
            value={resultSummary.created}
            tone="success"
          />
          <ImportStat
            label="Skipped"
            value={resultSummary.skipped}
            tone="warning"
          />
          <ImportStat
            label="Errors"
            value={resultSummary.errors}
            tone="danger"
          />
        </div>

        {editableRows.length ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-100">
                <ListChecks size={16} />
                Preview & edit
                <span className="text-xs font-normal text-neutral-500">
                  {selectedRowIndex + 1} of {editableRows.length}
                </span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2"
                  disabled={selectedRowIndex === 0 || importing}
                  onClick={() =>
                    setSelectedRowIndex((index) => Math.max(0, index - 1))
                  }
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="px-2 py-2"
                  disabled={
                    selectedRowIndex >= editableRows.length - 1 || importing
                  }
                  onClick={() =>
                    setSelectedRowIndex((index) =>
                      Math.min(editableRows.length - 1, index + 1),
                    )
                  }
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(270px,0.72fr)_minmax(420px,1.25fr)_minmax(260px,0.7fr)]">
              <div className="min-h-[360px] overflow-hidden rounded-lg border border-neutral-800 bg-[#0e1b26]">
                <TelegramPostPreview
                  channelTitle={channelTitle || "Preview"}
                  channelPhotoUrl={channelPhotoUrl ?? null}
                  text={selectedRow?.text ?? ""}
                  imageUrls={selectedImageUrls}
                  onTextChange={(nextText) => {
                    if (textEditorRef.current) {
                      textEditorRef.current.commitExternalChange(nextText);
                      return;
                    }
                    updateEditableRow(selectedRowIndex, { text: nextText });
                  }}
                  onUndo={() => textEditorRef.current?.undo()}
                  onRedo={() => textEditorRef.current?.redo()}
                />
              </div>

              {selectedRow ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
                    <FormField label="Title">
                      <Input
                        value={selectedRow.title}
                        disabled={importing}
                        onChange={(event) =>
                          updateEditableRow(selectedRowIndex, {
                            title: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Icon">
                      <IconPicker
                        compact
                        allowImages={false}
                        disabled={importing}
                        iconId={selectedIconId}
                        icon={selectedIconPresentation}
                        onChange={(iconId) =>
                          updateEditableRow(selectedRowIndex, {
                            icon: iconId ?? "",
                          })
                        }
                        onEmojiChange={(emoji) =>
                          updateEditableRow(selectedRowIndex, {
                            icon: emoji ?? "",
                          })
                        }
                        buttonLabel="Add emoji"
                        className="!h-9 !w-9"
                        iconClassName="!h-6 !w-6 !bg-transparent"
                      />
                    </FormField>
                  </div>
                  <FormField label="Telegram text">
                    <TelegramTextEditor
                      key={selectedRowIndex}
                      ref={textEditorRef}
                      rows={9}
                      value={selectedRow.text}
                      disabled={importing}
                      channelId={channelId}
                      enableInternalPostLinks
                      internalLinkUsage="edit"
                      highlightInternalLinkTargetId={
                        highlightedInternalLinkTargetId
                      }
                      highlightRequestKey={highlightRequestKey}
                      availableInternalPosts={managedPosts.data || []}
                      onChange={(nextText) =>
                        updateEditableRow(selectedRowIndex, {
                          text: nextText,
                        })
                      }
                    />
                  </FormField>
                  <ManagedPostInternalLinksNotice
                    links={selectedOutgoingInternalLinks}
                    channelTelegramChatId={channelTelegramChatId}
                    onHighlightTarget={highlightInternalLinkTarget}
                  />
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                    <FormField label="Image URLs">
                      <Textarea
                        rows={4}
                        value={selectedRow.urlsText}
                        disabled={importing}
                        placeholder="One image URL per line"
                        className="font-mono text-xs"
                        onChange={(event) =>
                          updateEditableRow(selectedRowIndex, {
                            urlsText: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Group position">
                      <Input
                        value={selectedRow.groupPosition}
                        disabled={importing}
                        placeholder="Default"
                        onChange={(event) =>
                          updateEditableRow(selectedRowIndex, {
                            groupPosition: event.target.value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                  <FormField label="Image search">
                    <Textarea
                      rows={3}
                      value={selectedRow.imageSearchText}
                      disabled={importing}
                      placeholder="One search query per line"
                      className="font-mono text-xs"
                      onChange={(event) =>
                        updateEditableRow(selectedRowIndex, {
                          imageSearchText: event.target.value,
                        })
                      }
                    />
                    {selectedImageSearchQueries.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedImageSearchQueries.map((query, index) => (
                          <button
                            key={`${query}-${index}`}
                            type="button"
                            disabled={importing}
                            onClick={() => {
                              void copyImageSearchQuery(query);
                            }}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-left text-xs text-neutral-200 transition hover:border-blue-600 hover:bg-blue-950/30 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Copy image search query"
                          >
                            <span className="min-w-0 truncate">{query}</span>
                            <Copy
                              size={12}
                              className="shrink-0 text-neutral-400"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-500">
                        Import-only hints for finding replacement images.
                      </p>
                    )}
                  </FormField>
                </div>
              ) : null}

              <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {editableRows.map((row, index) => (
                  <button
                    key={`${index}-${row.title}`}
                    type="button"
                    disabled={importing}
                    onClick={() => setSelectedRowIndex(index)}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                      index === selectedRowIndex
                        ? "border-blue-500 bg-blue-950/40 text-white"
                        : "border-neutral-800 bg-neutral-900/70 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center">
                      {row.icon || index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {row.title || "Untitled post"}
                    </span>
                    {urlsTextToArray(row.urlsText).length ? (
                      <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300">
                        img
                      </span>
                    ) : null}
                    {importImageSearchToArray(row.imageSearchText).length ? (
                      <span className="shrink-0 rounded bg-blue-950/60 px-1.5 py-0.5 text-[11px] text-blue-200">
                        search
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {skippedRows.length ? (
          <div className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-100">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle size={16} />
              Import errors ({skippedRows.length})
            </div>
            <ul className="space-y-1 text-xs">
              {skippedRows.slice(0, 5).map((item) => (
                <li key={`${item.index}-${item.error}`}>
                  Row {item.index + 1}: {item.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {localError ? (
          <p className="rounded-lg border border-rose-800/70 bg-rose-950/25 p-3 text-sm text-rose-200">
            {localError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            disabled={importing}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!canImport || importing}
          >
            <span className="inline-flex items-center gap-2">
              {importing ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <FileUp size={15} />
              )}
              {importing ? "Importing..." : "Import posts"}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number | string;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-200"
      : tone === "warning"
        ? "text-amber-200"
        : tone === "danger"
          ? "text-rose-200"
          : "text-neutral-100";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
