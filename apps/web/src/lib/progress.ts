import type { AppProgress } from "@/providers/toast-provider";

type ToastTone = "info" | "success" | "error" | "loading";

export type ProgressToastApi = {
  pushToast: (message: string, tone?: ToastTone, durationMs?: number) => void;
  setProgress: (progress: AppProgress | null) => void;
  clearProgress: (id?: string) => void;
};

export function scheduleProgressDismiss(
  clearProgress: ProgressToastApi["clearProgress"],
  id: string,
  delayMs = 2800,
) {
  window.setTimeout(() => clearProgress(id), delayMs);
}

export async function runProgressSequence<T>({
  api,
  id,
  title,
  steps,
  iconEmoji,
  iconUrl,
  onSuccess,
  onError,
}: {
  api: ProgressToastApi;
  id: string;
  title: string;
  steps: Array<{ message: string; run: () => Promise<void> }>;
  iconEmoji?: string;
  iconUrl?: string;
  onSuccess?: () => T;
  onError?: (error: unknown) => void;
}) {
  api.setProgress({
    id,
    title,
    current: 0,
    total: Math.max(steps.length, 1),
    message: "Starting…",
    iconEmoji,
    iconUrl,
  });
  try {
    for (const [index, step] of steps.entries()) {
      api.setProgress({
        id,
        title,
        current: index + 1,
        total: steps.length,
        message: step.message,
        iconEmoji,
        iconUrl,
      });
      await step.run();
    }
    api.setProgress({
      id,
      title,
      current: steps.length,
      total: steps.length,
      message: steps.at(-1)?.message || "Completed",
      completed: true,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      iconEmoji,
      iconUrl,
    });
    scheduleProgressDismiss(api.clearProgress, id);
    return onSuccess?.();
  } catch (error) {
    api.clearProgress(id);
    onError?.(error);
    throw error;
  }
}
