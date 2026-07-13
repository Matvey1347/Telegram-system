"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToastStack, type ToastItem } from "@/components/ui/primitives";
import { API_MUTATION_EVENT } from "@/lib/api";

type PushToast = (
  message: string,
  tone?: ToastItem["tone"],
  durationMs?: number,
  icon?: { emoji?: string | null; imageUrl?: string | null },
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

const ToastContext = createContext<{
  pushToast: PushToast;
  setProgress: (progress: AppProgress | null) => void;
  clearProgress: (id?: string) => void;
} | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mutationToasts, setMutationToasts] = useState<ToastItem[]>([]);
  const [progressEntries, setProgressEntries] = useState<AppProgress[]>([]);
  const lastManualSuccessToastAtRef = useRef(0);
  const mutationDismissTimersRef = useRef<Map<string, number>>(new Map());
  const mutationToastsRef = useRef<ToastItem[]>([]);
  const recentGenericMutationSuccessRef = useRef<Map<string, number>>(
    new Map(),
  );
  const genericSuccessReplacementWindowMs = 10_000;

  useEffect(() => {
    mutationToastsRef.current = mutationToasts;
  }, [mutationToasts]);

  const pushToastInternal = (
    message: string,
    tone: ToastItem["tone"] = "info",
    durationMs = 3500,
    icon?: { emoji?: string | null; imageUrl?: string | null },
  ) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [
      ...prev,
      {
        id,
        message,
        tone,
        iconEmoji: icon?.emoji || undefined,
        iconUrl: icon?.imageUrl || undefined,
      },
    ]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, durationMs);
  };

  const setProgress = (progress: AppProgress | null) => {
    if (!progress) {
      setProgressEntries([]);
      return;
    }
    const progressId = progress.id || "default";
    setProgressEntries((current) => {
      const next = current.filter((entry) => (entry.id || "default") !== progressId);
      return [...next, { ...progress, id: progressId }];
    });
  };

  const clearProgress = (id?: string) => {
    if (!id) {
      setProgressEntries([]);
      return;
    }
    setProgressEntries((current) =>
      current.filter((entry) => (entry.id || "default") !== id),
    );
  };

  const clearMutationDismissTimer = (id: string) => {
    const timer = mutationDismissTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      mutationDismissTimersRef.current.delete(id);
    }
  };

  const scheduleMutationToastDismiss = (id: string, durationMs: number) => {
    clearMutationDismissTimer(id);
    const timer = window.setTimeout(() => {
      setMutationToasts((current) =>
        current.filter((toast) => toast.id !== `mutation:${id}`),
      );
      recentGenericMutationSuccessRef.current.delete(`mutation:${id}`);
      mutationDismissTimersRef.current.delete(id);
    }, durationMs);
    mutationDismissTimersRef.current.set(id, timer);
  };

  const isGenericMutationSuccessMessage = (message: string) =>
    ["Saved successfully.", "Created successfully.", "Deleted successfully."].includes(
      message,
    );

  const replaceRecentGenericMutationSuccessToast = (
    message: string,
    icon?: { emoji?: string | null; imageUrl?: string | null },
  ) => {
    const now = Date.now();
    const target = [...mutationToastsRef.current]
      .reverse()
      .find((toast) => {
        if (toast.tone !== "success" || typeof toast.id !== "string") {
          return false;
        }
        const completedAt = recentGenericMutationSuccessRef.current.get(toast.id);
        return Boolean(
          completedAt && now - completedAt < genericSuccessReplacementWindowMs,
        );
      });
    if (!target || typeof target.id !== "string") return false;
    const mutationId = target.id.replace("mutation:", "");
    setMutationToasts((current) =>
      current.map((toast) =>
        toast.id === target.id
          ? {
              ...toast,
              title: undefined,
              message,
              iconEmoji: icon?.emoji || undefined,
              iconUrl: icon?.imageUrl || undefined,
            }
          : toast,
      ),
    );
    scheduleMutationToastDismiss(mutationId, 3000);
    recentGenericMutationSuccessRef.current.delete(target.id);
    return true;
  };

  const value = useMemo<{
    pushToast: PushToast;
    setProgress: typeof setProgress;
    clearProgress: typeof clearProgress;
  }>(
    () => ({
      pushToast: (message, tone = "info", durationMs = 3500, icon) => {
        if (tone === "success") {
          lastManualSuccessToastAtRef.current = Date.now();
          if (replaceRecentGenericMutationSuccessToast(message, icon)) {
            return;
          }
        }
        pushToastInternal(message, tone, durationMs, icon);
      },
      setProgress,
      clearProgress,
    }),
    [],
  );

  useEffect(() => {
    const handleMutation = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id: string;
          phase: "start" | "success" | "error";
          message?: string;
          scope?: "page";
        }>
      ).detail;
      if (!detail?.id) return;
      const toastId = `mutation:${detail.id}`;
      if (detail.phase === "start") {
        clearMutationDismissTimer(detail.id);
        setMutationToasts((current) => {
          const next = current.filter((toast) => toast.id !== toastId);
          return [
            ...next,
            {
              id: toastId,
              tone: "loading",
              title: "Processing",
              message: "Waiting for the server…",
            },
          ];
        });
        return;
      }
      if (!detail.message) {
        setMutationToasts((current) =>
          current.filter((toast) => toast.id !== toastId),
        );
        clearMutationDismissTimer(detail.id);
        return;
      }
      const suppressSuccessToast =
        detail.phase === "success" &&
        Date.now() - lastManualSuccessToastAtRef.current < 10_000;
      if (suppressSuccessToast) {
        setMutationToasts((current) =>
          current.filter((toast) => toast.id !== toastId),
        );
        clearMutationDismissTimer(detail.id);
        return;
      }
      window.setTimeout(() => {
        setMutationToasts((current) => {
          const existing = current.find((toast) => toast.id === toastId);
          const next = current.filter((toast) => toast.id !== toastId);
          return [
            ...next,
            {
              ...(existing || {}),
              id: toastId,
              tone: detail.phase === "success" ? "success" : "error",
              title: undefined,
              message: detail.message!,
            },
          ];
        });
        if (
          detail.phase === "success" &&
          isGenericMutationSuccessMessage(detail.message!)
        ) {
          recentGenericMutationSuccessRef.current.set(toastId, Date.now());
        } else {
          recentGenericMutationSuccessRef.current.delete(toastId);
        }
        scheduleMutationToastDismiss(
          detail.id,
          detail.phase === "success" ? 3000 : 6000,
        );
      }, detail.phase === "success" ? 120 : 0);
    };
    window.addEventListener(API_MUTATION_EVENT, handleMutation);
    return () => {
      window.removeEventListener(API_MUTATION_EVENT, handleMutation);
      mutationDismissTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      mutationDismissTimersRef.current.clear();
      recentGenericMutationSuccessRef.current.clear();
    };
  }, [value]);
  const systemToasts: ToastItem[] = [...mutationToasts];
  progressEntries.forEach((progress) => {
    const progressId = progress.id || "default";
    systemToasts.push({
      id: `progress:${progressId}`,
      tone: progress.completed
        ? progress.failedCount
          ? "error"
          : "success"
        : "loading",
      title: progress.title,
      message: progress.message || "Waiting for the server…",
      progress: { current: progress.current, total: progress.total },
      details: progress.completed
        ? `${progress.successCount || 0} success · ${progress.failedCount || 0} failed · ${progress.skippedCount || 0} skipped`
        : undefined,
      iconEmoji: progress.iconEmoji,
      iconUrl: progress.iconUrl,
    });
  });

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack
        items={[...systemToasts, ...toasts]}
        onClose={(id) => {
          if (typeof id === "string" && id.startsWith("progress:")) {
            clearProgress(id.replace("progress:", ""));
          } else if (typeof id === "string" && id.startsWith("mutation:")) {
            const mutationId = id.replace("mutation:", "");
            clearMutationDismissTimer(mutationId);
            recentGenericMutationSuccessRef.current.delete(id);
            setMutationToasts((current) =>
              current.filter((toast) => toast.id !== id),
            );
          } else if (typeof id === "number" && id >= 0) {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
          }
        }}
      />
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
