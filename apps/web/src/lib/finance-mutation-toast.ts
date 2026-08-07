import type { ResolvedEmoji } from '@/lib/api';

type PushToast = (
  message: string,
  tone?: 'info' | 'success' | 'error' | 'loading',
  durationMs?: number,
  icon?: { emoji?: string | null; imageUrl?: string | null },
) => void;

type FinanceToastOptions = {
  action: 'created' | 'updated';
  entityLabel: string;
  name: string;
  icon?: ResolvedEmoji | null;
};

export function pushFinanceMutationToast(
  pushToast: PushToast,
  { action, entityLabel, name, icon }: FinanceToastOptions,
) {
  const verb = action === 'created' ? 'created' : 'updated';
  pushToast(`${entityLabel} ${verb}: ${name}`, 'success', 3500, {
    emoji: icon?.type === 'unicode' ? icon.value : null,
    imageUrl: icon?.type === 'image' ? icon.url : null,
  });
}
