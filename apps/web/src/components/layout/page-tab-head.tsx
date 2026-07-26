"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";

const APP_NAME = "Telegram System";
const PAGE_TAB_HEAD_DYNAMIC_ATTR = "data-page-tab-head-dynamic";
const PAGE_TAB_HEAD_RELS = [
  "icon",
  "shortcut icon",
  "apple-touch-icon",
] as const;

type SavedIconLink = {
  rel: string;
  href: string;
  type: string;
  sizes: string;
};

type PageTabHeadEntry = {
  id: string;
  priority: number;
  order: number;
  title: string;
  faviconHref: string;
};

type PageTabHeadStore = {
  baseTitle: string;
  entries: Map<string, PageTabHeadEntry>;
  order: number;
};

declare global {
  interface Window {
    __pageTabHeadStore?: PageTabHeadStore;
  }
}

function buildEmojiFavicon(emoji: string, background: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="${background}" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="32">
        ${emoji}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function routeMeta(pathname: string) {
  if (pathname.startsWith("/telegram-posts")) {
    return { title: `Posts · ${APP_NAME}`, emoji: "✈️", color: "#1d4ed8" };
  }
  if (pathname.startsWith("/telegram/channels/")) {
    return { title: `Channel · ${APP_NAME}`, emoji: "📊", color: "#0f766e" };
  }
  if (pathname.startsWith("/telegram-channels")) {
    return { title: `Channels · ${APP_NAME}`, emoji: "📣", color: "#0f766e" };
  }
  if (pathname.startsWith("/ad-campaigns")) {
    return { title: `Campaigns · ${APP_NAME}`, emoji: "📈", color: "#7c3aed" };
  }
  if (pathname.startsWith("/finance")) {
    return { title: `Finance · ${APP_NAME}`, emoji: "💸", color: "#166534" };
  }
  if (pathname.startsWith("/transactions")) {
    return { title: `Transactions · ${APP_NAME}`, emoji: "💳", color: "#92400e" };
  }
  if (pathname.startsWith("/workspace-members")) {
    return { title: `Members · ${APP_NAME}`, emoji: "👥", color: "#475569" };
  }
  if (pathname.startsWith("/system-logs")) {
    return { title: `Logs · ${APP_NAME}`, emoji: "🧾", color: "#334155" };
  }
  if (pathname.startsWith("/settings")) {
    return { title: `Settings · ${APP_NAME}`, emoji: "⚙️", color: "#4b5563" };
  }
  if (pathname === "/") {
    return { title: `Dashboard · ${APP_NAME}`, emoji: "🏠", color: "#0f766e" };
  }
  return { title: APP_NAME, emoji: "▲", color: "#111827" };
}

function applyFaviconLinks(faviconHref: string) {
  const cacheSafeHref = faviconHref.startsWith("data:")
    ? faviconHref
    : `${faviconHref}${faviconHref.includes("?") ? "&" : "?"}tabIcon=${Date.now()}`;

  for (const rel of PAGE_TAB_HEAD_RELS) {
    const link = document.createElement("link");
    link.rel = rel;
    link.href = cacheSafeHref;
    link.setAttribute(PAGE_TAB_HEAD_DYNAMIC_ATTR, "true");
    link.type = cacheSafeHref.startsWith("data:image/svg+xml")
      ? "image/svg+xml"
      : "";
    document.head.appendChild(link);
  }
}

function applyPageTabHeadStore(store: PageTabHeadStore) {
  const dynamicLinks = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(
      `link[${PAGE_TAB_HEAD_DYNAMIC_ATTR}="true"]`,
    ),
  );
  for (const link of dynamicLinks) {
    link.remove();
  }

  const activeEntry = Array.from(store.entries.values()).sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    return right.order - left.order;
  })[0];

  if (!activeEntry) {
    document.title = store.baseTitle;
    return;
  }

  document.title = activeEntry.title;
  applyFaviconLinks(activeEntry.faviconHref);
}

function getPageTabHeadStore() {
  if (!window.__pageTabHeadStore) {
    window.__pageTabHeadStore = {
      baseTitle: document.title,
      entries: new Map(),
      order: 0,
    };
  }

  return window.__pageTabHeadStore;
}

export function PageTabHead({
  title,
  iconUrl,
  emoji,
  color,
  priority,
}: {
  title?: string | null;
  iconUrl?: string | null;
  emoji?: string | null;
  color?: string | null;
  priority?: number;
}) {
  const pathname = usePathname();
  const idRef = useRef("");
  const fallback = useMemo(() => routeMeta(pathname), [pathname]);
  const resolvedTitle = title?.trim() || fallback.title;
  const faviconHref =
    iconUrl?.trim() ||
    buildEmojiFavicon(
      emoji?.trim() || fallback.emoji,
      color?.trim() || fallback.color,
    );
  const resolvedPriority =
    priority ?? (title || iconUrl || emoji || color ? 10 : 0);

  useEffect(() => {
    if (!idRef.current) {
      idRef.current = `page-tab-head:${Math.random().toString(36).slice(2)}`;
    }

    const store = getPageTabHeadStore();
    const order = ++store.order;
    store.entries.set(idRef.current, {
      id: idRef.current,
      priority: resolvedPriority,
      order,
      title: resolvedTitle,
      faviconHref,
    });
    applyPageTabHeadStore(store);

    return () => {
      const nextStore = getPageTabHeadStore();
      nextStore.entries.delete(idRef.current);
      applyPageTabHeadStore(nextStore);
    };
  }, [faviconHref, resolvedPriority, resolvedTitle]);

  return null;
}
