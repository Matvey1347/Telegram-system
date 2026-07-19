"use client";

import { PropsWithChildren, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { applicationLogsApi, getLastCorrelationId } from "@/lib/api";

const DEDUPE_WINDOW_MS = 30_000;
const MAX_EVENTS_PER_WINDOW = 10;

export function ClientErrorReporter({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const sentRef = useRef<Map<string, number>>(new Map());
  const counterRef = useRef({ startedAt: Date.now(), count: 0 });
  const selfReportingRef = useRef(false);

  useEffect(() => {
    const shouldThrottle = () => {
      const now = Date.now();
      if (now - counterRef.current.startedAt > DEDUPE_WINDOW_MS) {
        counterRef.current = { startedAt: now, count: 0 };
      }
      counterRef.current.count += 1;
      return counterRef.current.count > MAX_EVENTS_PER_WINDOW;
    };

    const send = (message: string, stack?: string | null, metadata?: Record<string, unknown>) => {
      if (selfReportingRef.current) return;
      if (!message.trim()) return;
      const key = `${pathname}:${message}:${stack || ""}`;
      const now = Date.now();
      const previous = sentRef.current.get(key);
      if (previous && now - previous < DEDUPE_WINDOW_MS) return;
      if (shouldThrottle()) return;
      sentRef.current.set(key, now);
      selfReportingRef.current = true;
      void applicationLogsApi
        .createClientLog({
          message,
          stack,
          route: pathname,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : null,
          correlationId: getLastCorrelationId(),
          metadata,
        })
        .catch(() => undefined)
        .finally(() => {
          selfReportingRef.current = false;
        });
    };

    const onError = (event: ErrorEvent) => {
      if (pathname.startsWith("/system-logs")) return;
      send(
        event.message || "Unhandled window error",
        event.error instanceof Error ? event.error.stack || null : null,
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (pathname.startsWith("/system-logs")) return;
      const reason =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason || "Unhandled promise rejection"));
      send(reason.message, reason.stack || null);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [pathname]);

  return <>{children}</>;
}
