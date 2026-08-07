"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, FileUp, LoaderCircle } from "lucide-react";
import {
  Button,
  CustomSelect,
  FormField,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import {
  telegramChannelsApi,
  type TelegramManagedPostsImportResult,
  type TelegramManagedPostsImportRow,
} from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

const noGroupValue = "__no_group__";

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

function parseDelimitedRows(content: string, delimiter: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headerCells = parseDelimitedLine(lines[0], delimiter).map((cell) =>
    cell.toLocaleLowerCase(),
  );
  const hasHeader = headerCells.some((cell) =>
    [
      "title",
      "text",
      "icon",
      "emoji",
      "icontext",
      "imageurl",
      "imageurls",
      "groupposition",
      "order",
    ].includes(cell.replace(/\s+/g, "")),
  );

  const headers = hasHeader
    ? headerCells
    : ["title", "text", "imageurls", "icon", "groupposition"];
  const startIndex = hasHeader ? 1 : 0;

  return lines.slice(startIndex).map((line) => {
    const cells = parseDelimitedLine(line, delimiter);
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
      const imageLines = rest.filter((line) =>
        /^images?:/i.test(line),
      );
      const bodyLines = rest.filter((line) => !/^images?:/i.test(line));
      const imageUrls = imageLines
        .flatMap((line) => line.replace(/^images?:/i, "").split(/[,\s]+/))
        .map((value) => value.trim())
        .filter(Boolean);

      return {
        title,
        text: bodyLines.join("\n"),
        imageUrls,
      };
    });
}

type ParsedImportRow = Record<string, unknown>;

function normalizeImportRows(
  content: string,
  fileName?: string | null,
): TelegramManagedPostsImportRow[] {
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
    imageUrl: row.imageurl ?? row.imageUrl,
    imageUrls: row.imageurls ?? row.imageUrls,
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
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [postGroupId, setPostGroupId] = useState(noGroupValue);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [result, setResult] =
    useState<TelegramManagedPostsImportResult | null>(null);

  const postGroups = useQuery({
    queryKey: telegramPostKeys.postGroups(channelId),
    queryFn: () => telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
    enabled: open && Boolean(channelId),
  });

  const groupOptions = useMemo(
    () => [
      { value: noGroupValue, label: "No group" },
      ...(postGroups.data ?? []).map((group) => ({
        value: group.id,
        label: group.title,
        iconEmoji: group.icon ?? undefined,
        iconFallback: group.title,
      })),
    ],
    [postGroups.data],
  );

  const parsedRows = useMemo(
    () => normalizeImportRows(content, fileName),
    [content, fileName],
  );
  const canImport = Boolean(channelId) && parsedRows.length > 0;
  const resultSummary = summarizeResult(result);
  const skippedRows = result?.rows.filter((row) => row.status === "skipped") ?? [];

  const importMutation = useMutation({
    mutationFn: () =>
      telegramChannelsApi.importManagedPosts(channelId, {
        postGroupId: postGroupId === noGroupValue ? null : postGroupId,
        rows: parsedRows,
      }),
    onSuccess: async (nextResult) => {
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
      pushToast(
        `Imported ${nextSummary.created} posts. Skipped ${nextSummary.skipped}. Errors ${nextSummary.errors}.`,
        nextSummary.errors ? "info" : "success",
        5000,
      );
    },
    onError: (error) => {
      setLocalError(apiErrorMessage(error, "Could not import managed posts"));
    },
  });

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setLocalError("");
    setResult(null);
    setFileName(file.name);
    setContent(await file.text());
  };

  const close = () => {
    setLocalError("");
    setResult(null);
    onClose();
  };

  const submit = () => {
    setLocalError("");
    setResult(null);
    if (!parsedRows.length) {
      setLocalError("Paste rows or upload a CSV, TSV, or TXT file first.");
      return;
    }
    importMutation.mutate();
  };

  return (
    <Modal open={open} onClose={close} title="Import managed posts" size="xl">
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-800/60 bg-blue-950/20 p-3 text-sm text-blue-100">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <ClipboardList size={16} />
            GPT prompt format
          </div>
          <p className="text-blue-100/90">
            Ask GPT to return only CSV or TSV rows with these columns:
          </p>
          <pre className="mt-2 overflow-auto rounded-md bg-neutral-950 p-2 text-xs text-neutral-200">
            {`title,text,icon,imageUrl,imageUrls,groupPosition
Post title,"Telegram-ready post text","🔥",https://example.com/cover.png,"https://example.com/1.png, https://example.com/2.png",1`}
          </pre>
          <p className="mt-2 text-xs text-blue-100/80">
            `imageUrl` is for one image, `imageUrls` is for multiple. Both can be empty.
          </p>
        </div>

        <FormField label="Post group">
          <CustomSelect
            value={postGroupId}
            onChange={setPostGroupId}
            options={groupOptions}
            disabled={postGroups.isLoading || importMutation.isPending}
            placeholder={postGroups.isLoading ? "Loading groups..." : "Select group"}
          />
          {postGroups.error ? (
            <p className="mt-1 text-xs text-amber-300">
              Could not load post groups. Import can still create ungrouped posts.
            </p>
          ) : null}
        </FormField>

        <FormField label="Upload file">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950 px-3 py-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white">
            <FileUp size={18} />
            <span className="truncate">
              {fileName ? fileName : "Choose CSV, TSV, or TXT"}
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              disabled={importMutation.isPending}
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
              setContent(event.target.value);
              setFileName(null);
              setResult(null);
            }}
            rows={10}
            disabled={importMutation.isPending}
            placeholder="Paste CSV, TSV, or plain text posts here."
            className="font-mono text-xs"
          />
        </FormField>

        <div className="grid gap-2 sm:grid-cols-4">
          <ImportStat label="Parsed rows" value={parsedRows.length} />
          <ImportStat label="Created" value={resultSummary.created} tone="success" />
          <ImportStat label="Skipped" value={resultSummary.skipped} tone="warning" />
          <ImportStat label="Errors" value={resultSummary.errors} tone="danger" />
        </div>

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
            disabled={importMutation.isPending}
          >
            Close
          </Button>
          <Button type="button" onClick={submit} disabled={!canImport || importMutation.isPending}>
            <span className="inline-flex items-center gap-2">
              {importMutation.isPending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <FileUp size={15} />
              )}
              {importMutation.isPending ? "Importing..." : "Import posts"}
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
