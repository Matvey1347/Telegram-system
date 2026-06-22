'use client';

import { Children, PropsWithChildren, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, X } from 'lucide-react';

export type ToastItem = {
  id: number;
  message: string;
  tone?: 'success' | 'error' | 'info';
};

export function Button({ variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    secondary: 'bg-neutral-700 hover:bg-neutral-600 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
  }[variant];
  return <button {...props} className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ''}`} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ''}`} />;
}

function OptionIcon({ iconUrl, iconEmoji, fallback }: { iconUrl?: string; iconEmoji?: string; fallback?: string }) {
  if (iconUrl) return <img src={iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-md object-cover" />;
  if (iconEmoji) return <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">{iconEmoji}</span>;
  if (!fallback) return null;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-[11px] font-semibold text-neutral-200">
      {fallback.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const financeTypeClass = (value: string) => {
    if (value === 'income') return 'text-emerald-300';
    if (value === 'expense' || value === 'expenses' || value === 'expences') return 'text-rose-300';
    return '';
  };

  const options = Children.toArray(props.children)
    .filter(isValidElement)
    .map((child: any, idx: number) => {
      const rawChildren = Children.toArray(child.props?.children);
      const label = rawChildren.length
        ? rawChildren
            .map((node: any) =>
              typeof node === 'string' || typeof node === 'number'
                ? String(node)
                : '',
            )
            .join('')
        : String(child.props?.children ?? '');
      const hasExplicitValue = child.props?.value !== undefined;
      const value = String(hasExplicitValue ? child.props?.value : label);
      return {
        value,
        label,
        disabled: Boolean(child.props?.disabled),
        hidden: Boolean(child.props?.hidden),
        className: child.props?.className || financeTypeClass(value),
        iconUrl: child.props?.['data-icon-url'] ? String(child.props['data-icon-url']) : undefined,
        iconEmoji: child.props?.['data-icon-emoji'] ? String(child.props['data-icon-emoji']) : undefined,
        iconFallback: child.props?.['data-icon-fallback'] ? String(child.props['data-icon-fallback']) : undefined,
        key: `${value}-${idx}`,
      };
    });

  const [internalValue, setInternalValue] = useState(String(props.defaultValue ?? options[0]?.value ?? ''));
  const isControlled = props.value !== undefined;
  const currentValue = String((isControlled ? props.value : internalValue) ?? '');

  const selected = options.find((o) => o.value === currentValue);
  const menuOptions = options.filter((o) => !o.hidden);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const commit = (next: string) => {
    if (!isControlled) setInternalValue(next);
    if (props.onChange) {
      props.onChange({ target: { name: props.name, value: next } } as any);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50 ${props.className ?? ''}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? <OptionIcon iconUrl={selected.iconUrl} iconEmoji={selected.iconEmoji} fallback={selected.iconFallback} /> : null}
          <span className={`truncate ${selected ? selected.className || 'text-white' : 'text-neutral-400'}`}>{selected?.label || 'Select'}</span>
        </span>
        <ChevronDown size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {menuOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                commit(opt.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <OptionIcon iconUrl={opt.iconUrl} iconEmoji={opt.iconEmoji} fallback={opt.iconFallback} />
                <span className={`truncate ${opt.className}`}>{opt.label}</span>
              </span>
              {opt.value === currentValue ? <Check size={14} className="text-blue-300" /> : null}
            </button>
          ))}
        </div>
      ) : null}
      <input type="hidden" name={props.name} value={currentValue} />
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ''}`} />;
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [value, setValue] = useState(String(props.value ?? props.defaultValue ?? ''));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.value !== undefined) setValue(String(props.value || ''));
  }, [props.value]);

  const initialDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 320;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    recalc();
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('scroll', recalc, true);
    };
  }, [open]);

  const commit = (next: string) => {
    setValue(next);
    if (props.onChange) {
      props.onChange({ target: { name: props.name, value: next } } as any);
    }
  };

  const monthStartDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const pad = (monthStartDay + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const prevMonthDays = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();

  const cells: Array<{ iso: string; day: number; muted: boolean }> = [];
  for (let i = 0; i < pad; i += 1) {
    const day = prevMonthDays - pad + i + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, day);
    cells.push({ iso: formatLocalDate(d), day, muted: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ iso: formatLocalDate(d), day, muted: false });
  }
  while (cells.length < 42) {
    const day = cells.length - (pad + daysInMonth) + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
    cells.push({ iso: formatLocalDate(d), day, muted: true });
  }

  const selectedIso = value || '';
  const display = selectedIso ? selectedIso.split('-').reverse().join('.') : 'Select date';

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" {...(props as any)} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring ${props.className ?? ''}`}
      >
        <span className={selectedIso ? 'text-white' : 'text-neutral-400'}>{display}</span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div className={`absolute z-50 w-[300px] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? 'bottom-full mb-1' : 'mt-1'}`}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded p-1 hover:bg-neutral-800" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
            <p className="text-sm font-medium">{cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</p>
            <button type="button" className="rounded p-1 hover:bg-neutral-800" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const selected = cell.iso === selectedIso;
              return (
                <button
                  key={`${cell.iso}-${cell.day}`}
                  type="button"
                  onClick={() => { commit(cell.iso); setOpen(false); }}
                  className={`rounded px-1 py-1.5 text-sm ${selected ? 'bg-blue-600 text-white' : cell.muted ? 'text-neutral-500 hover:bg-neutral-800' : 'text-white hover:bg-neutral-800'}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button type="button" className="text-neutral-400 hover:text-white" onClick={() => commit('')}>Clear</button>
            <button type="button" className="text-blue-300 hover:text-blue-200" onClick={() => { const now = new Date(); const iso = formatLocalDate(now); commit(iso); setOpen(false); }}>Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const tone =
    value === 'active' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700' :
    value === 'draft' || value === 'planned' ? 'bg-amber-900/40 text-amber-300 border-amber-700' :
    value === 'finished' ? 'bg-blue-900/40 text-blue-300 border-blue-700' :
    value === 'cancelled' || value === 'archived' ? 'bg-red-900/40 text-red-300 border-red-700' :
    'bg-neutral-800 text-neutral-300 border-neutral-700';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>;
}

type SelectOption = {
  value: string;
  label: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconFallback?: string;
  tone?: 'success' | 'warning' | 'danger' | 'muted' | 'info';
};

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select',
  disabled = false,
}: {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (!rootRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const toneClass = (tone?: SelectOption['tone']) =>
    tone === 'success' ? 'text-emerald-300' : tone === 'warning' ? 'text-amber-300' : tone === 'danger' ? 'text-red-300' : tone === 'info' ? 'text-blue-300' : 'text-neutral-200';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? <OptionIcon iconUrl={selected.iconUrl} iconEmoji={selected.iconEmoji} fallback={selected.iconFallback} /> : null}
          <span className={`truncate ${selected ? toneClass(selected.tone) : 'text-neutral-400'}`}>{selected?.label || placeholder}</span>
        </span>
        <ChevronDown size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <OptionIcon iconUrl={opt.iconUrl} iconEmoji={opt.iconEmoji} fallback={opt.iconFallback} />
                  <span className={`truncate ${toneClass(opt.tone)}`}>{opt.label}</span>
                </span>
                {isSelected ? <Check size={14} className="text-blue-300" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`rounded-2xl border border-neutral-800 bg-neutral-900 p-5 ${className}`}>{children}</div>;
}

export function Table({ children }: PropsWithChildren) {
  return (
    <div className="table-scroll w-full">
      <table className="w-max min-w-full text-left text-sm text-neutral-200">{children}</table>
    </div>
  );
}

export function EntityCard({ title, children, actions, className = '' }: PropsWithChildren<{ title: React.ReactNode; actions?: React.ReactNode; className?: string }>) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {actions}
      </div>
      <div className="space-y-1 text-sm text-neutral-300">{children}</div>
    </Card>
  );
}

export function IconButton({ kind = 'edit', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'edit' | 'delete' }) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg border p-2 ${kind === 'delete' ? 'border-red-700 text-red-300 hover:bg-red-950' : 'border-neutral-700 text-neutral-200 hover:bg-neutral-800'} ${props.className ?? ''}`}
    >
      {kind === 'delete' ? <Trash2 size={16} /> : <Pencil size={16} />}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: PropsWithChildren<{ open: boolean; onClose: () => void; title: string; size?: 'md' | 'sm' }>) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`flex max-h-[84vh] w-full flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl ${size === 'sm' ? 'max-w-[560px]' : 'max-w-[660px]'}`}>
        <div className="mb-1 flex items-center justify-between p-5 pb-3">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="cursor-pointer rounded-lg border border-neutral-700 p-2 hover:bg-neutral-800"><X size={16} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  entityName,
  label = 'Delete',
  description,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  entityName: string;
  label?: string;
  description?: string;
}) {
  const [value, setValue] = useState('');
  const valid = useMemo(() => value === entityName, [value, entityName]);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirm deletion">
      <p className="mb-2 text-sm text-neutral-300">Type <span className="font-semibold text-white">{entityName}</span> to confirm deletion.</p>
      {description ? <p className="mb-3 text-sm text-amber-300">{description}</p> : null}
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={entityName} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setValue(''); onClose(); }}>Cancel</Button>
        <Button variant="danger" disabled={!valid} onClick={() => { onConfirm(); setValue(''); }}>{label}</Button>
      </div>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div><h2 className="text-3xl font-semibold">{title}</h2>{subtitle ? <p className="mt-1 text-neutral-400">{subtitle}</p> : null}</div>
      {action}
    </div>
  );
}

export function FormField({
  label,
  required,
  error,
  children,
}: PropsWithChildren<{ label: string; required?: boolean; error?: string }>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-300">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-red-400">{message}</p>;
}

export function LoadingState({ text = 'Loading...' }: { text?: string }) {
  return <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-neutral-300">{text}</div>;
}

export function EmptyState({ text = 'No data yet.' }: { text?: string }) {
  return <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-neutral-400">{text}</div>;
}

export function ToastStack({ items, onClose }: { items: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-full max-w-lg flex-col gap-2">
      {items.map((item) => {
        const toneClass = item.tone === 'success' ? 'border-emerald-700 text-emerald-200' : item.tone === 'error' ? 'border-red-700 text-red-200' : 'border-blue-700 text-blue-200';
        return (
          <div key={item.id} className={`rounded-lg border bg-neutral-900 p-3 shadow-xl ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{item.message}</p>
              <button
                className="flex h-6 w-6 shrink-0 items-center justify-center text-neutral-400 hover:text-white"
                onClick={() => onClose(item.id)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
