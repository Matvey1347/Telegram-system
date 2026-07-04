"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
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
  title: string;
  current: number;
  total: number;
  message?: string;
  completed?: boolean;
  successCount?: number;
  failedCount?: number;
  skippedCount?: number;
};

const ToastContext = createContext<{
  pushToast: PushToast;
  setProgress: (progress: AppProgress | null) => void;
} | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(
    () => new Set(),
  );
  const [progress, setProgress] = useState<AppProgress | null>(null);

  const value = useMemo<{
    pushToast: PushToast;
    setProgress: typeof setProgress;
  }>(
    () => ({
      pushToast: (message, tone = "info", durationMs = 3500, icon) => {
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
      },
      setProgress,
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
          scope?: "page" | "modal";
        }>
      ).detail;
      if (!detail?.id) return;
      if (detail.scope !== "modal") {
        setPendingRequests((current) => {
          const next = new Set(current);
          if (detail.phase === "start") next.add(detail.id);
          else next.delete(detail.id);
          return next;
        });
      }
      if (detail.phase !== "start" && detail.message) {
        const showToast = () => {
          value.pushToast(
            detail.message!,
            detail.phase === "success" ? "success" : "error",
            detail.phase === "success" ? 3000 : 6000,
          );
        };
        if (detail.scope === "modal" && detail.phase === "success") {
          const initialModalCount = document.querySelectorAll(
            '[data-app-modal="true"]',
          ).length;
          const startedAt = Date.now();
          const waitForModalClose = () => {
            const currentModalCount = document.querySelectorAll(
              '[data-app-modal="true"]',
            ).length;
            if (
              currentModalCount < initialModalCount ||
              Date.now() - startedAt > 10_000
            ) {
              showToast();
              return;
            }
            window.setTimeout(waitForModalClose, 50);
          };
          window.setTimeout(waitForModalClose, 0);
        } else {
          window.setTimeout(showToast, 0);
        }
      }
    };
    window.addEventListener(API_MUTATION_EVENT, handleMutation);
    return () => window.removeEventListener(API_MUTATION_EVENT, handleMutation);
  }, [value]);

  const systemToasts: ToastItem[] = [];
  if (pendingRequests.size) {
    systemToasts.push({
      id: -1,
      tone: "loading",
      title: "Processing",
      message:
        pendingRequests.size === 1
          ? "Waiting for the server…"
          : `${pendingRequests.size} actions are running…`,
    });
  }
  if (progress) {
    systemToasts.push({
      id: -2,
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
    });
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack
        items={[...systemToasts, ...toasts]}
        onClose={(id) => {
          if (id === -2) setProgress(null);
          else if (id >= 0) {
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
