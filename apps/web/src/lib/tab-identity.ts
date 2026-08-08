"use client";

const APP_NAME = "Telegram System";

export type TabIdentity = {
  title: string;
  emoji: string;
  color: string;
  iconUrl?: string | null;
};

export type TabIdentityOverride = {
  title?: string | null;
  emoji?: string | null;
  color?: string | null;
  iconUrl?: string | null;
};

type RouteResolverInput = {
  pathname: string;
  searchParams:
    | URLSearchParams
    | Pick<URLSearchParams, "get" | "toString">
    | null
    | undefined;
};

function escapeSvg(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildEmojiFavicon(emoji: string, background: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="${escapeSvg(background)}" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="32">
        ${escapeSvg(emoji)}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildRouteTabIdentityCacheKey({
  pathname,
  searchParams,
}: RouteResolverInput) {
  const rawSearch = searchParams?.toString()?.trim() ?? "";
  if (!rawSearch) return pathname;
  const params = new URLSearchParams(rawSearch);
  const entries = [...params.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }
      return leftKey.localeCompare(rightKey);
    },
  );
  const normalized = new URLSearchParams();
  for (const [key, value] of entries) {
    normalized.append(key, value);
  }
  return `${pathname}?${normalized.toString()}`;
}

function pageTitle(section: string, entityTitle?: string | null) {
  return entityTitle?.trim()
    ? `${section} · ${entityTitle.trim()} · ${APP_NAME}`
    : `${section} · ${APP_NAME}`;
}

function parseTelegramTab(value: string | null) {
  return value === "networks" || value === "accounts" || value === "bot"
    ? value
    : "channels";
}

function parseChannelFilter(value: string | null) {
  return value === "external" ? "external" : "own";
}

function parseAccountFilter(value: string | null) {
  return value === "people" ? "people" : "mtproto";
}

function telegramPostsRouteView(
  pathname: string,
  get: (key: string) => string | null,
) {
  if (pathname === "/telegram-posts") {
    return get("groupId")
      ? "Groups"
      : get("postView") === "calendar"
        ? "Calendar"
        : "Posts";
  }

  if (/^\/telegram-posts\/[^/]+\/calendar$/u.test(pathname)) {
    return "Calendar";
  }
  if (/^\/telegram-posts\/[^/]+\/editor$/u.test(pathname)) {
    return "Posts";
  }

  return null;
}

export function resolveRouteTabIdentity({
  pathname,
  searchParams,
}: RouteResolverInput): TabIdentity {
  const get = (key: string) => searchParams?.get(key) ?? null;

  if (pathname === "/") {
    return { title: pageTitle("Dashboard"), emoji: "📊", color: "#0f766e" };
  }
  if (pathname === "/finance") {
    return { title: pageTitle("Finance"), emoji: "💰", color: "#166534" };
  }
  if (pathname === "/accounts") {
    return { title: pageTitle("Accounts"), emoji: "💳", color: "#1d4ed8" };
  }
  if (pathname === "/transactions") {
    return { title: pageTitle("Transactions"), emoji: "🧾", color: "#92400e" };
  }
  if (pathname === "/categories") {
    return { title: pageTitle("Categories"), emoji: "🗂️", color: "#475569" };
  }
  if (pathname === "/transfers") {
    return { title: pageTitle("Transfers"), emoji: "🔄", color: "#0f766e" };
  }
  if (pathname === "/currencies") {
    return { title: pageTitle("Currencies"), emoji: "💱", color: "#1d4ed8" };
  }
  if (pathname === "/telegram-channels") {
    const tab = parseTelegramTab(get("tab"));
    const channelFilter = parseChannelFilter(get("channelTab"));
    const accountFilter = parseAccountFilter(get("accountTab"));
    if (tab === "networks") {
      return { title: pageTitle("Networks"), emoji: "🕸️", color: "#4338ca" };
    }
    if (tab === "accounts") {
      return accountFilter === "people"
        ? { title: pageTitle("People"), emoji: "👤", color: "#0f766e" }
        : { title: pageTitle("Accounts"), emoji: "👤", color: "#1d4ed8" };
    }
    if (tab === "bot") {
      return { title: pageTitle("Bot"), emoji: "🤖", color: "#2563eb" };
    }
    return channelFilter === "external"
      ? { title: pageTitle("Catalog"), emoji: "🔎", color: "#7c2d12" }
      : { title: pageTitle("Channels"), emoji: "📣", color: "#0f766e" };
  }
  const telegramPostsView = telegramPostsRouteView(pathname, get);
  if (telegramPostsView) {
    const view = telegramPostsView;
    const emoji = view === "Groups" ? "🗂️" : view === "Calendar" ? "🗓️" : "✈️";
    const color =
      view === "Groups"
        ? "#475569"
        : view === "Calendar"
          ? "#7c2d12"
          : "#1d4ed8";
    return { title: pageTitle(view), emoji, color };
  }
  if (pathname.startsWith("/telegram/channels/")) {
    return { title: pageTitle("Analytics"), emoji: "📊", color: "#0f766e" };
  }
  if (pathname === "/ad-campaigns") {
    return { title: pageTitle("Ads"), emoji: "📈", color: "#7c3aed" };
  }
  if (pathname.startsWith("/ad-campaigns/")) {
    return { title: pageTitle("Campaign"), emoji: "📈", color: "#7c3aed" };
  }
  if (pathname === "/ad-sales" || pathname.startsWith("/ad-sales/")) {
    if (pathname.startsWith("/ad-sales/pricing")) {
      return {
        title: pageTitle("Ad Sales Pricing"),
        emoji: "📈",
        color: "#1d4ed8",
      };
    }
    if (pathname.startsWith("/ad-sales/analytics")) {
      return {
        title: pageTitle("Ad Sales Analytics"),
        emoji: "📊",
        color: "#0f766e",
      };
    }
    if (pathname.startsWith("/ad-sales/settings")) {
      return {
        title: pageTitle("Ad Sales Settings"),
        emoji: "⚙️",
        color: "#4b5563",
      };
    }
    if (pathname.startsWith("/ad-sales/clients")) {
      return {
        title: pageTitle("Ad Sales Clients"),
        emoji: "👥",
        color: "#0f766e",
      };
    }
    if (pathname.startsWith("/ad-sales/sales")) {
      return { title: pageTitle("Ad Sales"), emoji: "💰", color: "#0f766e" };
    }
    return { title: pageTitle("Ad Sales"), emoji: "💼", color: "#0f766e" };
  }
  if (pathname === "/settings") {
    return { title: pageTitle("Settings"), emoji: "⚙️", color: "#4b5563" };
  }
  if (pathname === "/workspace-members") {
    return { title: pageTitle("Members"), emoji: "👥", color: "#475569" };
  }
  if (pathname === "/account") {
    return { title: pageTitle("Profile"), emoji: "👤", color: "#0f766e" };
  }
  if (pathname === "/system-logs") {
    return { title: pageTitle("Logs"), emoji: "🐞", color: "#7f1d1d" };
  }
  if (pathname === "/login") {
    return { title: pageTitle("Sign in"), emoji: "🔐", color: "#1d4ed8" };
  }
  if (pathname === "/register") {
    return { title: pageTitle("Register"), emoji: "✨", color: "#7c3aed" };
  }
  if (pathname === "/advertising-channels") {
    return { title: pageTitle("Sources"), emoji: "📡", color: "#0f766e" };
  }
  if (pathname === "/ad-sources") {
    return { title: pageTitle("Sources"), emoji: "📡", color: "#0f766e" };
  }
  if (pathname === "/telegram-user-accounts") {
    return { title: pageTitle("Accounts"), emoji: "📱", color: "#1d4ed8" };
  }
  if (pathname === "/telegram-channel-networks") {
    return { title: pageTitle("Networks"), emoji: "🕸️", color: "#4338ca" };
  }
  if (pathname.startsWith("/telegram-channel-networks/")) {
    return { title: pageTitle("Network"), emoji: "🕸️", color: "#4338ca" };
  }
  if (pathname === "/promos") {
    return { title: pageTitle("Promos"), emoji: "🎟️", color: "#92400e" };
  }
  if (pathname === "/investments") {
    return { title: pageTitle("Investments"), emoji: "💼", color: "#166534" };
  }

  return { title: APP_NAME, emoji: "✳️", color: "#111827" };
}

export function mergeTabIdentity(
  fallback: TabIdentity,
  override?: TabIdentityOverride | null,
): TabIdentity {
  return {
    title: override?.title?.trim() || fallback.title,
    emoji: override?.emoji?.trim() || fallback.emoji,
    color: override?.color?.trim() || fallback.color,
    iconUrl: override?.iconUrl?.trim() || null,
  };
}
