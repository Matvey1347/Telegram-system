'use client';

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ToastStack, type ToastItem } from '@/components/ui/primitives';
import { API_MUTATION_EVENT } from '@/lib/api';

type PushToast = (message: string, tone?: ToastItem['tone'], durationMs?: number) => void;

const ToastContext = createContext<{ pushToast: PushToast } | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(
    () => new Set(),
  );

  const value = useMemo<{ pushToast: PushToast }>(
    () => ({
      pushToast: (message, tone = 'info', durationMs = 3500) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((prev) => [...prev, { id, message, tone }]);
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, durationMs);
      },
    }),
    [],
  );

  useEffect(() => {
    const handleMutation = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id: string;
          phase: 'start' | 'success' | 'error';
          message?: string;
          scope?: 'page' | 'modal';
        }>
      ).detail;
      if (!detail?.id) return;
      if (detail.scope !== 'modal') {
        setPendingRequests((current) => {
          const next = new Set(current);
          if (detail.phase === 'start') next.add(detail.id);
          else next.delete(detail.id);
          return next;
        });
      }
      if (detail.phase !== 'start' && detail.message) {
        const showToast = () => {
          value.pushToast(
            detail.message!,
            detail.phase === 'success' ? 'success' : 'error',
            detail.phase === 'success' ? 3000 : 6000,
          );
        };
        if (detail.scope === 'modal' && detail.phase === 'success') {
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

  return (
    <ToastContext.Provider value={value}>
      {children}
      {pendingRequests.size ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-label="Waiting for server response"
        >
          <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
            <LoaderCircle size={22} className="animate-spin text-blue-400" />
            Processing…
          </div>
        </div>
      ) : null}
      <ToastStack items={toasts} onClose={(id) => setToasts((prev) => prev.filter((toast) => toast.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useAppToast must be used within ToastProvider');
  }

  return context;
}
