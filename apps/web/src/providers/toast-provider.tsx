"use client";

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToastStack, type ToastItem } from "@/components/ui/primitives";
import { API_MUTATION_EVENT } from "@/lib/api";

type ToastTone = NonNullable<ToastItem["tone"]>;

type ToastIcon = {
  emoji?: string | null;
  imageUrl?: string | null;
};

type OperationPhase = "loading" | "success" | "error" | "info";

type OperationEntry = {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  iconEmoji?: string;
  iconUrl?: string;
  progress?: { current: number; total: number };
  details?: string;
  createdAt: number;
};

type OperationStartInput = {
  id: string;
  title?: string;
  message: string;
  icon?: ToastIcon;
  current?: number;
  total?: number;
};

type OperationUpdateInput = {
  title?: string;
  message?: string;
  icon?: ToastIcon;
  current?: number;
  total?: number;
  details?: string;
};

type OperationResultInput = {
  title?: string;
  message: string;
  details?: string;
  code?: string;
  correlationId?: string;
  icon?: ToastIcon;
};

type OperationHandle = {
  id: string;
  update: (input: OperationUpdateInput) => void;
  succeed: (input: OperationResultInput) => void;
  fail: (input: OperationResultInput) => void;
  dismiss: () => void;
};

type PushToast = (
  message: string,
  tone?: ToastTone,
  durationMs?: number,
  icon?: ToastIcon,
) => void;

export type AppProgress = {
  id?: string;
  title: string;
  current: number;
  total: number;
  message?: string;
  completed?: boolean;
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
  iconEmoji?: string;
  iconUrl?: string;
};

const SUCCESS_DISMISS_MS = 3200;
const ERROR_DISMISS_MS = 8000;
const INFO_DISMISS_MS = 4000;

type ApiMutationEventDetail = {
  id: string;
  phase: "start" | "success" | "error";
  title?: string;
  message?: string;
  details?: string;
  code?: string;
  correlationId?: string;
  icon?: ToastIcon;
  mode?: "automatic" | "managed" | "silent";
};

const ToastContext = createContext<{
  pushToast: PushToast;
  startOperation: (input: OperationStartInput) => OperationHandle;
  dismissOperation: (id: string) => void;
  setProgress: (progress: AppProgress | null) => void;
  clearProgress: (id?: string) => void;
} | null>(null);

function buildDetails({
  details,
  code,
  correlationId,
}: {
  details?: string;
  code?: string;
  correlationId?: string;
}) {
  const parts = [
    details?.trim(),
    code ? `Code: ${code}` : undefined,
    correlationId ? `Correlation ID: ${correlationId}` : undefined,
  ].filter(Boolean);
  return parts.join("\n");
}

function normalizeProgress(current?: number, total?: number) {
  if (
    typeof current !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return undefined;
  }
  return { current, total };
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [entries, setEntries] = useState<OperationEntry[]>([]);
  const entriesRef = useRef<Map<string, OperationEntry>>(new Map());
  const dismissTimersRef = useRef<Map<string, number>>(new Map());
  const sequenceRef = useRef(0);

  const clearDismissTimer = useCallback((id: string) => {
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  const upsertEntry = useCallback(
    (id: string, updater: (existing?: OperationEntry) => OperationEntry) => {
      setEntries((current) => {
        const existing = current.find((entry) => entry.id === id);
        const nextEntry = updater(existing);
        const next = current.filter((entry) => entry.id !== id);
        next.push(nextEntry);
        entriesRef.current.set(id, nextEntry);
        return next;
      });
    },
    [],
  );

  const dismissOperation = useCallback(
    (id: string) => {
      clearDismissTimer(id);
      setEntries((current) => {
        const next = current.filter((entry) => entry.id !== id);
        entriesRef.current.delete(id);
        return next;
      });
    },
    [clearDismissTimer],
  );

  const scheduleDismiss = useCallback(
    (id: string, delayMs: number) => {
      clearDismissTimer(id);
      const timer = window.setTimeout(() => dismissOperation(id), delayMs);
      dismissTimersRef.current.set(id, timer);
    },
    [clearDismissTimer, dismissOperation],
  );

  const transitionOperation = useCallback(
    (
      id: string,
      phase: OperationPhase,
      input: OperationUpdateInput & {
        code?: string;
        correlationId?: string;
      },
    ) => {
      clearDismissTimer(id);
      upsertEntry(id, (existing) => ({
        id,
        createdAt: existing?.createdAt ?? Date.now(),
        title: input.title ?? existing?.title,
        message: input.message ?? existing?.message ?? "Working…",
        tone:
          phase === "loading"
            ? "loading"
            : phase === "success"
              ? "success"
              : phase === "error"
                ? "error"
                : "info",
        iconEmoji: input.icon?.emoji ?? existing?.iconEmoji,
        iconUrl: input.icon?.imageUrl ?? existing?.iconUrl,
        progress: normalizeProgress(input.current, input.total) ?? existing?.progress,
        details:
          buildDetails({
            details: input.details,
            code: input.code,
            correlationId: input.correlationId,
          }) || existing?.details,
      }));
      if (phase === "success") scheduleDismiss(id, SUCCESS_DISMISS_MS);
      if (phase === "error") scheduleDismiss(id, ERROR_DISMISS_MS);
      if (phase === "info") scheduleDismiss(id, INFO_DISMISS_MS);
    },
    [clearDismissTimer, scheduleDismiss, upsertEntry],
  );

  const startOperation = useCallback(
    (input: OperationStartInput): OperationHandle => {
      transitionOperation(input.id, "loading", {
        title: input.title,
        message: input.message,
        icon: input.icon,
        current: input.current,
        total: input.total,
      });
      return {
        id: input.id,
        update: (next) => transitionOperation(input.id, "loading", next),
        succeed: (next) => transitionOperation(input.id, "success", next),
        fail: (next) => transitionOperation(input.id, "error", next),
        dismiss: () => dismissOperation(input.id),
      };
    },
    [dismissOperation, transitionOperation],
  );

  const pushToast = useCallback<PushToast>(
    (message, tone = "info", durationMs = INFO_DISMISS_MS, icon) => {
      sequenceRef.current += 1;
      const id = `toast:${sequenceRef.current}`;
      upsertEntry(id, () => ({
        id,
        createdAt: Date.now(),
        message,
        tone,
        iconEmoji: icon?.emoji || undefined,
        iconUrl: icon?.imageUrl || undefined,
      }));
      if (tone !== "loading") {
        scheduleDismiss(id, durationMs);
      }
    },
    [scheduleDismiss, upsertEntry],
  );

  const setProgress = useCallback(
    (progress: AppProgress | null) => {
      if (!progress) {
        [...entriesRef.current.keys()]
          .filter((id) => id.startsWith("progress:"))
          .forEach((id) => dismissOperation(id));
        return;
      }
      const id = `progress:${progress.id || "default"}`;
      const handle = startOperation({
        id,
        title: progress.title,
        message: progress.message || "Working…",
        icon: {
          emoji: progress.iconEmoji,
          imageUrl: progress.iconUrl,
        },
        current: progress.current,
        total: progress.total,
      });
      if (progress.completed) {
        handle.succeed({
          title: progress.title,
          message: progress.message || "Completed",
          details: `${progress.successCount || 0} success · ${progress.failedCount || 0} failed · ${progress.skippedCount || 0} skipped`,
          icon: {
            emoji: progress.iconEmoji,
            imageUrl: progress.iconUrl,
          },
        });
        return;
      }
      handle.update({
        title: progress.title,
        message: progress.message || "Working…",
        current: progress.current,
        total: progress.total,
        icon: {
          emoji: progress.iconEmoji,
          imageUrl: progress.iconUrl,
        },
      });
    },
    [dismissOperation, startOperation],
  );

  const clearProgress = useCallback(
    (id?: string) => {
      if (!id) {
        setProgress(null);
        return;
      }
      dismissOperation(`progress:${id}`);
    },
    [dismissOperation, setProgress],
  );

  useEffect(() => {
    const handleMutation = (event: Event) => {
      const detail = (event as CustomEvent<ApiMutationEventDetail>).detail;
      if (!detail?.id || detail.mode === "managed" || detail.mode === "silent") {
        return;
      }
      if (detail.phase === "start") {
        startOperation({
          id: `mutation:${detail.id}`,
          title: detail.title || "Processing",
          message: detail.message || "Waiting for the server…",
          icon: detail.icon,
        });
        return;
      }
      const handle = startOperation({
        id: `mutation:${detail.id}`,
        title: detail.title || "Processing",
        message: detail.message || "Waiting for the server…",
        icon: detail.icon,
      });
      if (detail.phase === "success") {
        handle.succeed({
          title: detail.title,
          message: detail.message || "Saved successfully.",
          details: detail.details,
          code: detail.code,
          correlationId: detail.correlationId,
          icon: detail.icon,
        });
        return;
      }
      handle.fail({
        title: detail.title,
        message: detail.message || "The operation could not be completed.",
        details: detail.details,
        code: detail.code,
        correlationId: detail.correlationId,
        icon: detail.icon,
      });
    };
    window.addEventListener(API_MUTATION_EVENT, handleMutation);
    return () => {
      window.removeEventListener(API_MUTATION_EVENT, handleMutation);
      dismissTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      dismissTimersRef.current.clear();
      entriesRef.current.clear();
    };
  }, [startOperation]);

  const items = useMemo<ToastItem[]>(
    () =>
      [...entries].sort((a, b) => a.createdAt - b.createdAt).map((entry) => ({
        id: entry.id,
        title: entry.title,
        message: entry.message,
        tone: entry.tone,
        iconEmoji: entry.iconEmoji,
        iconUrl: entry.iconUrl,
        progress: entry.progress,
        details: entry.details,
      })),
    [entries],
  );

  const value = useMemo(
    () => ({
      pushToast,
      startOperation,
      dismissOperation,
      setProgress,
      clearProgress,
    }),
    [clearProgress, dismissOperation, pushToast, setProgress, startOperation],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack items={items} onClose={(id) => dismissOperation(String(id))} />
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useAppToast must be used within ToastProvider");
  }
  return context;
}

export function useOperationFeedback() {
  const { startOperation, dismissOperation } = useAppToast();
  return useMemo(
    () => ({
      start: startOperation,
      dismiss: dismissOperation,
    }),
    [dismissOperation, startOperation],
  );
}
