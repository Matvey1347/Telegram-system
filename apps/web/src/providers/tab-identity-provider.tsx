"use client";

import {
  createContext,
  type MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildEmojiFavicon,
  buildRouteTabIdentityCacheKey,
  mergeTabIdentity,
  resolveRouteTabIdentity,
  type TabIdentity,
  type TabIdentityOverride,
} from "@/lib/tab-identity";

type TabIdentityEntry = {
  order: number;
  value: TabIdentityOverride;
};

type TabIdentityContextValue = {
  setOverride: (id: string, value: TabIdentityOverride) => void;
  clearOverride: (id: string) => void;
};

const TabIdentityContext = createContext<TabIdentityContextValue | null>(null);

const ICON_REL_SELECTOR =
  'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]';
const SUCCESSFUL_FAVICON_KEY_PREFIX = "tab-identity:favicon-ok:";
const TAB_IDENTITY_CACHE_KEY_PREFIX = "tab-identity:route:";
const faviconSupportCache = new Map<string, boolean>();

type IconSnapshot = {
  element: HTMLLinkElement;
  href: string;
  type: string;
};

type CachedTabIdentity = Pick<TabIdentity, "title" | "emoji" | "color" | "iconUrl">;

function storageKey(url: string) {
  return `${SUCCESSFUL_FAVICON_KEY_PREFIX}${encodeURIComponent(url)}`;
}

function tabIdentityStorageKey(key: string) {
  return `${TAB_IDENTITY_CACHE_KEY_PREFIX}${encodeURIComponent(key)}`;
}

function readCachedFaviconSuccess(url: string) {
  if (faviconSupportCache.has(url)) {
    return faviconSupportCache.get(url);
  }
  if (typeof window === "undefined") return undefined;
  try {
    const cached = window.sessionStorage.getItem(storageKey(url));
    if (cached === "1") {
      faviconSupportCache.set(url, true);
      return true;
    }
  } catch {}
  return undefined;
}

function rememberFaviconSuccess(url: string) {
  faviconSupportCache.set(url, true);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(url), "1");
  } catch {}
}

function markFaviconFailure(url: string) {
  faviconSupportCache.set(url, false);
}

function shouldCacheRouteIdentity(pathname: string) {
  return (
    pathname === "/telegram-posts" ||
    pathname.startsWith("/telegram-posts/") ||
    pathname.startsWith("/telegram/channels/")
  );
}

function readCachedRouteIdentity(key: string): CachedTabIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(tabIdentityStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTabIdentity | null;
    if (!parsed?.title?.trim() || !parsed?.emoji?.trim() || !parsed?.color?.trim()) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      emoji: parsed.emoji.trim(),
      color: parsed.color.trim(),
      iconUrl: parsed.iconUrl?.trim() || null,
    };
  } catch {
    return null;
  }
}

function writeCachedRouteIdentity(key: string, identity: CachedTabIdentity) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(tabIdentityStorageKey(key), JSON.stringify(identity));
  } catch {}
}

function preloadFavicon(url: string) {
  if (url.startsWith("data:")) {
    rememberFaviconSuccess(url);
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => {
      rememberFaviconSuccess(url);
      resolve(true);
    };
    image.onerror = () => {
      markFaviconFailure(url);
      resolve(false);
    };
    image.src = url;
  });
}

function resolveActiveOverride(entries: TabIdentityEntry[]) {
  return entries
    .sort((left, right) => right.order - left.order)
    .at(0)?.value;
}

function ensureIconLinks(createdLinksRef: MutableRefObject<HTMLLinkElement[]>) {
  const links = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(ICON_REL_SELECTOR),
  );

  const ensureRel = (rel: string) => {
    const existing = links.find((link) => link.rel === rel);
    if (existing) return existing;
    const link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
    createdLinksRef.current.push(link);
    links.push(link);
    return link;
  };

  ensureRel("icon");
  ensureRel("shortcut icon");
  ensureRel("apple-touch-icon");

  return links;
}

function applyTabIdentity(
  identity: TabIdentity,
  createdLinksRef: MutableRefObject<HTMLLinkElement[]>,
) {
  document.title = identity.title;

  const href = identity.iconUrl?.trim()
    ? identity.iconUrl.trim()
    : buildEmojiFavicon(identity.emoji, identity.color);
  const type = resolveIconType(href);
  const links = ensureIconLinks(createdLinksRef);

  for (const link of links) {
    link.href = href;
    link.type = type;
  }
}

function expectedIconHref(identity: TabIdentity) {
  return identity.iconUrl?.trim()
    ? identity.iconUrl.trim()
    : buildEmojiFavicon(identity.emoji, identity.color);
}

function headMatchesTabIdentity(identity: TabIdentity) {
  if (document.title !== identity.title) return false;

  const href = expectedIconHref(identity);
  const type = resolveIconType(href);
  const links = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>(ICON_REL_SELECTOR),
  );
  if (!links.length) return false;

  return links.every((link) => {
    const currentHref = link.getAttribute("href") || "";
    const currentType = link.getAttribute("type") || "";
    return currentHref === href && currentType === type;
  });
}

function resolveIconType(href: string) {
  if (href.startsWith("data:image/svg+xml")) return "image/svg+xml";
  if (href.startsWith("data:image/png")) return "image/png";
  if (href.startsWith("data:image/webp")) return "image/webp";
  if (href.startsWith("data:image/jpeg") || href.startsWith("data:image/jpg")) {
    return "image/jpeg";
  }
  try {
    const url = href.startsWith("http://") || href.startsWith("https://")
      ? new URL(href)
      : new URL(href, window.location.origin);
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".svg")) return "image/svg+xml";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".ico")) return "image/x-icon";
  } catch {}
  return "";
}

export function TabIdentityProvider({ children }: PropsWithChildren) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const entriesRef = useRef(new Map<string, TabIdentityEntry>());
  const orderRef = useRef(0);
  const createdLinksRef = useRef<HTMLLinkElement[]>([]);
  const initialTitleRef = useRef("");
  const initialIconSnapshotsRef = useRef<IconSnapshot[]>([]);
  const isApplyingRef = useRef(false);
  const [entriesSnapshot, setEntriesSnapshot] = useState<TabIdentityEntry[]>([]);
  const [resolvedIconUrls, setResolvedIconUrls] = useState<Record<string, string | null>>({});

  const routeIdentity = useMemo(
    () => resolveRouteTabIdentity({ pathname, searchParams }),
    [pathname, searchParams],
  );

  const routeCacheKey = useMemo(
    () => buildRouteTabIdentityCacheKey({ pathname, searchParams }),
    [pathname, searchParams],
  );

  const activeOverride = useMemo(
    () => resolveActiveOverride(entriesSnapshot),
    [entriesSnapshot],
  );
  const cachedRouteIdentity = useMemo(
    () =>
      shouldCacheRouteIdentity(pathname)
        ? readCachedRouteIdentity(routeCacheKey)
        : null,
    [pathname, routeCacheKey],
  );

  const effectiveIdentity = useMemo(
    () => mergeTabIdentity(routeIdentity, activeOverride ?? cachedRouteIdentity),
    [activeOverride, cachedRouteIdentity, routeIdentity],
  );

  useEffect(() => {
    initialTitleRef.current = document.title;
    initialIconSnapshotsRef.current = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>(ICON_REL_SELECTOR),
    ).map((element) => ({
      element,
      href: element.href,
      type: element.type,
    }));

    return () => {
      document.title = initialTitleRef.current;
      for (const link of createdLinksRef.current) {
        link.remove();
      }
      createdLinksRef.current = [];
      for (const snapshot of initialIconSnapshotsRef.current) {
        snapshot.element.href = snapshot.href;
        snapshot.element.type = snapshot.type;
      }
    };
  }, []);

  useEffect(() => {
    const candidate = effectiveIdentity.iconUrl?.trim() || null;

    if (!candidate) return;

    const cached = readCachedFaviconSuccess(candidate);
    if (cached !== undefined) return;
    if (candidate in resolvedIconUrls) return;

    let active = true;
    preloadFavicon(candidate).then((success) => {
      if (!active) return;
      setResolvedIconUrls((current) => {
        const nextValue = success ? candidate : null;
        if (current[candidate] === nextValue) return current;
        return { ...current, [candidate]: nextValue };
      });
    });
    return () => {
      active = false;
    };
  }, [effectiveIdentity.iconUrl, resolvedIconUrls]);

  const resolvedIconUrl = useMemo(() => {
    const candidate = effectiveIdentity.iconUrl?.trim() || null;
    if (!candidate) return null;
    const cached = readCachedFaviconSuccess(candidate);
    if (cached === true) return candidate;
    if (cached === false) return null;
    return resolvedIconUrls[candidate] ?? null;
  }, [effectiveIdentity.iconUrl, resolvedIconUrls]);

  const appliedIdentity = useMemo<TabIdentity>(() => {
    const currentCandidate = effectiveIdentity.iconUrl?.trim() || null;
    return {
      ...effectiveIdentity,
      iconUrl:
        currentCandidate && resolvedIconUrl === currentCandidate
          ? resolvedIconUrl
          : null,
    };
  }, [effectiveIdentity, resolvedIconUrl]);

  useLayoutEffect(() => {
    isApplyingRef.current = true;
    applyTabIdentity(appliedIdentity, createdLinksRef);
    queueMicrotask(() => {
      isApplyingRef.current = false;
    });
  }, [appliedIdentity]);

  useEffect(() => {
    isApplyingRef.current = true;
    applyTabIdentity(appliedIdentity, createdLinksRef);
    queueMicrotask(() => {
      isApplyingRef.current = false;
    });
  }, [appliedIdentity]);

  useEffect(() => {
    if (!shouldCacheRouteIdentity(pathname)) return;
    writeCachedRouteIdentity(routeCacheKey, appliedIdentity);
  }, [appliedIdentity, pathname, routeCacheKey]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (isApplyingRef.current) return;
      if (headMatchesTabIdentity(appliedIdentity)) return;
      isApplyingRef.current = true;
      applyTabIdentity(appliedIdentity, createdLinksRef);
      queueMicrotask(() => {
        isApplyingRef.current = false;
      });
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "rel", "type"],
    });

    return () => {
      observer.disconnect();
    };
  }, [appliedIdentity]);

  const contextValue = useMemo<TabIdentityContextValue>(
    () => ({
      setOverride: (id, value) => {
        const existing = entriesRef.current.get(id);
        const nextValue = {
          order: existing?.order ?? ++orderRef.current,
          value,
        };
        entriesRef.current.set(id, nextValue);
        setEntriesSnapshot([...entriesRef.current.values()]);
      },
      clearOverride: (id) => {
        if (!entriesRef.current.delete(id)) return;
        setEntriesSnapshot([...entriesRef.current.values()]);
      },
    }),
    [],
  );

  return (
    <TabIdentityContext.Provider value={contextValue}>
      {children}
    </TabIdentityContext.Provider>
  );
}

export function useTabIdentityController() {
  return useContext(TabIdentityContext);
}
