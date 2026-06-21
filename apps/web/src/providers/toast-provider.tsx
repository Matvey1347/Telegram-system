'use client';

import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { ToastStack, type ToastItem } from '@/components/ui/primitives';

type PushToast = (message: string, tone?: ToastItem['tone'], durationMs?: number) => void;

const ToastContext = createContext<{ pushToast: PushToast } | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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

  return (
    <ToastContext.Provider value={value}>
      {children}
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
