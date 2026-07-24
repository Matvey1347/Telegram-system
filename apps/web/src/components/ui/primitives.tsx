"use client";

import {
  Children,
  PropsWithChildren,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";

export type ToastItem = {
  id: number | string;
  message: string;
  title?: string;
  tone?: "success" | "error" | "info" | "loading";
  iconEmoji?: string;
  iconUrl?: string;
  progress?: { current: number; total: number };
  details?: string;
};

export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-neutral-700 hover:bg-neutral-600 text-white",
    danger: "bg-red-600 hover:bg-red-500 text-white",
  }[variant];
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
    />
  );
}

export function normalizeTimeInputValue(value: string) {
  const sanitized = value.replace(/[^\d:.\s]/g, "").replace(/\s+/g, "");
  if (!sanitized) return "";
  const normalized = sanitized.replace(/\./g, ":");
  if (!normalized.includes(":")) {
    if (normalized.length <= 2) return normalized;
    return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
  }
  const [hours = "", minutes = ""] = normalized.split(":", 2);
  return `${hours.slice(0, 2)}:${minutes.slice(0, 2)}`;
}

export function isValidTimeInputValue(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function TimeInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const { className, onChange, placeholder, ...restProps } = props;
  return (
    <div className="relative">
      <input
        {...restProps}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder={placeholder ?? "HH:MM"}
        onChange={(event) => {
          event.target.value = normalizeTimeInputValue(event.target.value);
          onChange?.(event);
        }}
        className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 pr-11 text-sm text-white outline-none ring-blue-500 focus:ring ${className ?? ""}`}
      />
      <Clock3
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300"
      />
    </div>
  );
}

function OptionIcon({
  iconUrl,
  iconEmoji,
  fallback,
}: {
  iconUrl?: string;
  iconEmoji?: string;
  fallback?: string;
}) {
  if (iconUrl)
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-5 w-5 shrink-0 rounded-md object-cover"
      />
    );
  if (iconEmoji)
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">
        {iconEmoji}
      </span>
    );
  if (!fallback) return null;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-[11px] font-semibold text-neutral-200">
      {fallback.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const financeTypeClass = (value: string) => {
    if (value === "income") return "text-emerald-300";
    if (value === "expense" || value === "expenses" || value === "expences")
      return "text-rose-300";
    return "";
  };

  const options = Children.toArray(props.children)
    .filter(isValidElement)
    .map((child: any, idx: number) => {
      const rawChildren = Children.toArray(child.props?.children);
      const label = rawChildren.length
        ? rawChildren
            .map((node: any) =>
              typeof node === "string" || typeof node === "number"
                ? String(node)
                : "",
            )
            .join("")
        : String(child.props?.children ?? "");
      const hasExplicitValue = child.props?.value !== undefined;
      const value = String(hasExplicitValue ? child.props?.value : label);
      return {
        value,
        label,
        disabled: Boolean(child.props?.disabled),
        hidden: Boolean(child.props?.hidden),
        className: child.props?.className || financeTypeClass(value),
        iconUrl: child.props?.["data-icon-url"]
          ? String(child.props["data-icon-url"])
          : undefined,
        iconEmoji: child.props?.["data-icon-emoji"]
          ? String(child.props["data-icon-emoji"])
          : undefined,
        iconFallback: child.props?.["data-icon-fallback"]
          ? String(child.props["data-icon-fallback"])
          : undefined,
        key: `${value}-${idx}`,
      };
    });

  const [internalValue, setInternalValue] = useState(
    String(props.defaultValue ?? options[0]?.value ?? ""),
  );
  const isControlled = props.value !== undefined;
  const currentValue = String(
    (isControlled ? props.value : internalValue) ?? "",
  );

  const selected = options.find((o) => o.value === currentValue);
  const menuOptions = options.filter((o) => !o.hidden);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filteredMenuOptions = menuOptions.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  const pickFirstFilteredOption = () => {
    const normalizedSearch = search.trim();
    const candidate = normalizedSearch
      ? filteredMenuOptions.find((option) => !option.disabled)
      : menuOptions.find((option) => !option.disabled);
    if (!candidate) return;
    commit(candidate.value);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown);
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
        onClick={() => {
          setOpen((value) => {
            if (value) setSearch("");
            return !value;
          });
        }}
        className={`flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50 ${props.className ?? ""}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <OptionIcon
              iconUrl={selected.iconUrl}
              iconEmoji={selected.iconEmoji}
              fallback={selected.iconFallback}
            />
          ) : null}
          <span
            className={`truncate ${selected ? selected.className || "text-white" : "text-neutral-400"}`}
          >
            {selected?.label || "Select"}
          </span>
        </span>
        <ChevronDown size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="border-b border-neutral-800 p-2">
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  pickFirstFilteredOption();
                }
              }}
              placeholder="Search..."
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {filteredMenuOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.disabled) return;
                  commit(opt.value);
                  setOpen(false);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <OptionIcon
                    iconUrl={opt.iconUrl}
                    iconEmoji={opt.iconEmoji}
                    fallback={opt.iconFallback}
                  />
                  <span className={`truncate ${opt.className}`}>
                    {opt.label}
                  </span>
                </span>
                {opt.value === currentValue ? (
                  <Check size={14} className="text-blue-300" />
                ) : null}
              </button>
            ))}
            {!filteredMenuOptions.length ? (
              <p className="px-3 py-3 text-center text-sm text-neutral-500">
                No options found
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <input type="hidden" name={props.name} value={currentValue} />
    </div>
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
    />
  );
}

export function DateInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const locale = props.lang === "ru" ? "ru-RU" : undefined;
  const formatLocalDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [value, setValue] = useState(
    String(props.value ?? props.defaultValue ?? ""),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.value !== undefined) setValue(String(props.value || ""));
  }, [props.value]);

  const initialDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [cursor, setCursor] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      let boundaryTop = 0;
      let boundaryBottom = window.innerHeight;
      let ancestor = rootRef.current.parentElement;
      while (ancestor) {
        const overflowY = window.getComputedStyle(ancestor).overflowY;
        if (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "hidden"
        ) {
          const boundary = ancestor.getBoundingClientRect();
          boundaryTop = Math.max(0, boundary.top);
          boundaryBottom = Math.min(window.innerHeight, boundary.bottom);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      const estimatedHeight = 340;
      const spaceBelow = boundaryBottom - rect.bottom;
      const spaceAbove = rect.top - boundaryTop;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  const commit = (next: string) => {
    setValue(next);
    if (props.onChange) {
      props.onChange({ target: { name: props.name, value: next } } as any);
    }
  };

  const monthStartDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
  ).getDay();
  const pad = (monthStartDay + 6) % 7;
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    0,
  ).getDate();

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

  const selectedIso = value || "";
  const display = selectedIso
    ? selectedIso.split("-").reverse().join(".")
    : props.placeholder || "Select date";

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" {...(props as any)} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
      >
        <span className={selectedIso ? "text-white" : "text-neutral-400"}>
          {display}
        </span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-[min(300px,calc(100vw-2rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? "bottom-full mb-1" : "mt-1"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium">
              {cursor.toLocaleString(locale, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {(locale === "ru-RU"
              ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
              : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
            ).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const selected = cell.iso === selectedIso;
              return (
                <button
                  key={`${cell.iso}-${cell.day}`}
                  type="button"
                  onClick={() => {
                    commit(cell.iso);
                    setOpen(false);
                  }}
                  className={`rounded px-1 py-1.5 text-sm ${selected ? "bg-blue-600 text-white" : cell.muted ? "text-neutral-500 hover:bg-neutral-800" : "text-white hover:bg-neutral-800"}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <button
              type="button"
              className="text-neutral-400 hover:text-white"
              onClick={() => commit("")}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-blue-300 hover:text-blue-200"
              onClick={() => {
                const now = new Date();
                const iso = formatLocalDate(now);
                commit(iso);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DateRangeInputProps = {
  from?: string;
  to?: string;
  onChange: (range: { from: string; to: string }) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

function formatLocalDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value?: string) {
  return value ? value.split("-").reverse().join(".") : "";
}

function monthCells(cursor: Date) {
  const monthStartDay = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    1,
  ).getDay();
  const pad = (monthStartDay + 6) % 7;
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();
  const prevMonthDays = new Date(
    cursor.getFullYear(),
    cursor.getMonth(),
    0,
  ).getDate();
  const cells: Array<{ iso: string; day: number; muted: boolean }> = [];

  for (let i = 0; i < pad; i += 1) {
    const day = prevMonthDays - pad + i + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - 1, day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: true });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: false });
  }
  while (cells.length < 42) {
    const day = cells.length - (pad + daysInMonth) + 1;
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + 1, day);
    cells.push({ iso: formatLocalDateValue(d), day, muted: true });
  }

  return cells;
}

export function DateRangeInput({
  from = "",
  to = "",
  onChange,
  disabled,
  className = "",
  placeholder = "Select period",
}: DateRangeInputProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = from || to;
    const date = base ? new Date(`${base}T00:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selectingEnd, setSelectingEnd] = useState(Boolean(from && !to));

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const estimatedHeight = 360;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  const display =
    start || end
      ? `${formatDisplayDate(start)}${end ? ` - ${formatDisplayDate(end)}` : ""}`
      : placeholder;
  const cells = monthCells(cursor);

  const pick = (iso: string) => {
    if (!selectingEnd || !from) {
      onChange({ from: iso, to: "" });
      setSelectingEnd(true);
      return;
    }
    const next = iso < from ? { from: iso, to: from } : { from, to: iso };
    onChange(next);
    setSelectingEnd(false);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className={start || end ? "text-white" : "text-neutral-400"}>
          {display}
        </span>
        <CalendarDays size={16} className="text-neutral-400" />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl ${openUp ? "bottom-full mb-1" : "mt-1"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-medium">
              {cursor.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
            <button
              type="button"
              className="rounded p-1 hover:bg-neutral-800"
              onClick={() =>
                setCursor(
                  new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-2 text-xs text-neutral-400">
            {selectingEnd ? "Select end date" : "Select start date"}
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-neutral-400">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const selected = cell.iso === start || cell.iso === end;
              const inRange = Boolean(
                start && end && cell.iso > start && cell.iso < end,
              );
              return (
                <button
                  key={`${cell.iso}-${cell.day}`}
                  type="button"
                  onClick={() => pick(cell.iso)}
                  className={`rounded px-1 py-1.5 text-sm ${selected ? "bg-blue-600 text-white" : inRange ? "bg-blue-950 text-blue-100" : cell.muted ? "text-neutral-500 hover:bg-neutral-800" : "text-white hover:bg-neutral-800"}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <button
              type="button"
              className="text-neutral-400 hover:text-white"
              onClick={() => {
                onChange({ from: "", to: "" });
                setSelectingEnd(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-blue-300 hover:text-blue-200"
              onClick={() => {
                const iso = formatLocalDateValue(new Date());
                onChange({ from: iso, to: iso });
                setSelectingEnd(false);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const tone =
    value === "active"
      ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
      : value === "draft" || value === "planned"
        ? "bg-amber-900/40 text-amber-300 border-amber-700"
        : value === "finished"
          ? "bg-blue-900/40 text-blue-300 border-blue-700"
          : value === "cancelled" || value === "archived"
            ? "bg-red-900/40 text-red-300 border-red-700"
            : "bg-neutral-800 text-neutral-300 border-neutral-700";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {value}
    </span>
  );
}

type SelectOption = {
  value: string;
  label: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconFallback?: string;
  tone?: "success" | "warning" | "danger" | "muted" | "info";
};

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled = false,
  dropdownDirection = "down",
  searchable = true,
}: {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  dropdownDirection?: "up" | "down";
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);
  const filteredOptions = searchable
    ? options.filter((option) =>
        option.label
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : options;

  const pickFirstFilteredOption = () => {
    const normalizedSearch = search.trim();
    const candidate = normalizedSearch
      ? filteredOptions[0]
      : options[0];
    if (!candidate) return;
    onChange(candidate.value);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (!rootRef.current.contains(target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  const toneClass = (tone?: SelectOption["tone"]) =>
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : tone === "info"
            ? "text-blue-300"
            : "text-neutral-200";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((value) => {
            if (value) setSearch("");
            return !value;
          });
        }}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <OptionIcon
              iconUrl={selected.iconUrl}
              iconEmoji={selected.iconEmoji}
              fallback={selected.iconFallback}
            />
          ) : null}
          <span
            className={`truncate ${selected ? toneClass(selected.tone) : "text-neutral-400"}`}
          >
            {selected?.label || placeholder}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-neutral-400 transition-transform ${dropdownDirection === "up" && open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className={`absolute z-50 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl ${
            dropdownDirection === "up" ? "bottom-full mb-1" : "mt-1"
          }`}
        >
          {searchable ? (
            <div className="border-b border-neutral-800 p-2">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setOpen(false);
                    setSearch("");
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    pickFirstFilteredOption();
                  }
                }}
                placeholder="Search..."
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-auto">
            {filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <OptionIcon
                      iconUrl={opt.iconUrl}
                      iconEmoji={opt.iconEmoji}
                      fallback={opt.iconFallback}
                    />
                    <span className={`truncate ${toneClass(opt.tone)}`}>
                      {opt.label}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check size={14} className="text-blue-300" />
                  ) : null}
                </button>
              );
            })}
            {!filteredOptions.length ? (
              <p className="px-3 py-3 text-center text-sm text-neutral-500">
                No options found
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function MasonryGrid({
  children,
  className = "",
  itemClassName = "",
}: PropsWithChildren<{ className?: string; itemClassName?: string }>) {
  return (
    <div
      className={`columns-1 gap-4 md:columns-2 xl:columns-3 ${className}`}
    >
      {Children.map(children, (child, index) => (
        <div
          key={isValidElement(child) && child.key != null ? String(child.key) : index}
          className={`mb-4 break-inside-avoid ${itemClassName}`}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export function Table({ children }: PropsWithChildren) {
  return (
    <div className="table-scroll w-full">
      <table className="w-max min-w-full text-left text-sm text-neutral-200">
        {children}
      </table>
    </div>
  );
}

export function EntityCard({
  title,
  children,
  actions,
  className = "",
}: PropsWithChildren<{
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}>) {
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

export function IconButton({
  kind = "edit",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "edit" | "delete";
}) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-lg border p-2 ${kind === "delete" ? "border-red-700 text-red-300 hover:bg-red-950" : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"} ${props.className ?? ""}`}
    >
      {kind === "delete" ? <Trash2 size={16} /> : <Pencil size={16} />}
    </button>
  );
}

export function TooltipBubble({
  children,
  side = "top",
  align = "center",
  className = "",
}: {
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const positionClass =
    side === "top"
      ? "bottom-full mb-3"
      : "top-full mt-3";
  const alignClass =
    align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const arrowAnchorClass =
    align === "left"
      ? "left-4"
      : align === "right"
        ? "right-4"
        : "left-1/2 -translate-x-1/2";
  const arrowClass =
    side === "top"
      ? "top-full -translate-y-1/2 rotate-45 border-b border-r"
      : "bottom-full translate-y-1/2 rotate-45 border-t border-l";

  return (
    <span
      className={`pointer-events-none absolute z-50 w-max max-w-[calc(100vw-2rem)] rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs leading-relaxed text-neutral-100 shadow-xl ${positionClass} ${alignClass} ${className}`}
    >
      {children}
      <span
        className={`absolute h-3 w-3 border-neutral-700 bg-neutral-950 ${arrowAnchorClass} ${arrowClass}`}
        aria-hidden="true"
      />
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  allowOverflow = false,
  loading: _loading = false,
}: PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "md" | "sm" | "xl";
  allowOverflow?: boolean;
  loading?: boolean;
}>) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        data-app-modal="true"
        className={`relative flex max-h-[calc(100dvh-1rem)] w-full flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl sm:max-h-[84vh] ${allowOverflow ? "overflow-visible" : "overflow-hidden"} ${size === "sm" ? "max-w-[560px]" : size === "xl" ? "max-w-[1280px]" : "max-w-[660px]"}`}
      >
        <div className="mb-1 flex items-center justify-between p-4 pb-3 sm:p-5 sm:pb-3">
          <h3 className="text-lg font-semibold sm:text-xl">{title}</h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-neutral-700 p-2 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className={`min-h-0 px-4 pb-4 sm:px-5 sm:pb-5 ${allowOverflow ? "overflow-visible" : "overflow-y-auto"}`}
        >
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
  label = "Delete",
  description,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  entityName: string;
  label?: string;
  description?: string;
}) {
  const [value, setValue] = useState("");
  const valid = useMemo(() => value === entityName, [value, entityName]);
  useEffect(() => {
    if (!open) {
      setValue("");
    }
  }, [open]);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirm deletion">
      <p className="mb-2 text-sm text-neutral-300">
        Type <span className="font-semibold text-white">{entityName}</span> to
        confirm deletion.
      </p>
      {description ? (
        <p className="mb-3 text-sm text-amber-300">{description}</p>
      ) : null}
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={entityName} />
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setValue("");
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!valid}
          onClick={() => {
            setValue("");
            onClose();
            void Promise.resolve(onConfirm()).catch(() => undefined);
          }}
        >
          <span className="inline-flex items-center gap-2">{label}</span>
        </Button>
      </div>
    </Modal>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full sm:w-auto [&>a]:inline-flex [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">
          {action}
        </div>
      ) : null}
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
    <div className="block text-sm">
      <span className="mb-1 block text-neutral-300">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-red-400">{message}</p>;
}

export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  );
}

export function TableLoadingState({
  text = "Loading...",
  columns = 4,
  rows = 5,
}: {
  text?: string;
  columns?: number;
  rows?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-neutral-800" aria-hidden="true">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3 bg-neutral-950 px-3 py-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={columnIndex === 0 ? "h-10 w-4/5" : "h-5 w-full"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ text = "No data yet." }: { text?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-neutral-400">
      {text}
    </div>
  );
}

export function ToastStack({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose: (id: number | string) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let element = document.getElementById("app-notification-stack");
    if (!element) {
      element = document.createElement("div");
      element.id = "app-notification-stack";
      element.className =
        "fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 pointer-events-none";
      document.body.appendChild(element);
    }
    setHost(element);
  }, []);

  if (!host) return null;

  return createPortal(
    <>
      {items.map((item) => {
        const tone = item.tone || "info";
        const styles = {
          success: {
            card: "border-emerald-700/70 bg-emerald-950/95",
            icon: "bg-emerald-500/15 text-emerald-300",
            bar: "bg-emerald-400",
            title: "Success",
          },
          error: {
            card: "border-red-700/70 bg-red-950/95",
            icon: "bg-red-500/15 text-red-300",
            bar: "bg-red-400",
            title: "Something went wrong",
          },
          info: {
            card: "border-blue-700/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-400",
            title: "Information",
          },
          loading: {
            card: "border-blue-600/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-500",
            title: "Processing",
          },
        }[tone];
        const StatusIcon =
          tone === "success"
            ? CircleCheck
            : tone === "error"
              ? CircleX
              : tone === "loading"
                ? LoaderCircle
                : Info;
        const percentage = item.progress?.total
          ? Math.min(100, (item.progress.current / item.progress.total) * 100)
          : 0;
        return (
          <div
            key={item.id}
            role={tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto overflow-hidden rounded-xl border p-3.5 text-neutral-100 shadow-2xl backdrop-blur-md [animation:notification-in_180ms_ease-out] ${styles.card}`}
          >
            <div className="flex items-start gap-3">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : item.iconEmoji ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">
                  {item.iconEmoji}
                </span>
              ) : (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
                >
                  <StatusIcon
                    size={19}
                    className={tone === "loading" ? "animate-spin" : ""}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {item.title || styles.title}
                  </p>
                  {item.progress ? (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {item.progress.current}/{item.progress.total}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm leading-5 text-neutral-300">
                  {item.message}
                </p>
                {item.progress ? (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${styles.bar}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                ) : null}
                {item.details ? (
                  <p className="mt-2 text-xs text-neutral-400">
                    {item.details}
                  </p>
                ) : null}
              </div>
              {tone !== "loading" ? (
                <button
                  type="button"
                  aria-label="Close notification"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white"
                  onClick={() => onClose(item.id)}
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>,
    host,
  );
}
