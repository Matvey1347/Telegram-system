import { StrictMode, type ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { buildRouteTabIdentityCacheKey } from "@/lib/tab-identity";
import { TabIdentityProvider } from "@/providers/tab-identity-provider";

let currentPathname = "/";
let currentSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => currentPathname),
  useSearchParams: vi.fn(() => new URLSearchParams(currentSearch)),
}));

function renderWithTabProvider(children?: ReactNode) {
  return render(<TabIdentityProvider>{children}</TabIdentityProvider>);
}

function iconHref(rel: "icon" | "shortcut icon" | "apple-touch-icon" = "icon") {
  return (
    document
      .querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
      ?.getAttribute("href") || ""
  );
}

function expectEmojiFavicon(emoji: string) {
  const href = iconHref("icon");
  expect(href).toContain("data:image/svg+xml");
  expect(decodeURIComponent(href)).toContain(emoji);
}

describe("TabIdentityProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = "/";
    currentSearch = "";
    document.title = "Telegram System";
    document.head.innerHTML = `
      <link rel="icon" href="/favicon.ico">
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
    `;
  });

  it("sets Finance title and emoji favicon", async () => {
    currentPathname = "/finance";

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Finance · Telegram System");
    });
    expectEmojiFavicon("💰");
  });

  it("sets Dashboard metadata for root route", async () => {
    currentPathname = "/";

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Dashboard · Telegram System");
    });
    expectEmojiFavicon("📊");
  });

  it("uses Catalog metadata for external telegram channel catalog", async () => {
    currentPathname = "/telegram-channels";
    currentSearch = "tab=channels&channelTab=external";

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Catalog · Telegram System");
    });
    expectEmojiFavicon("🔎");
  });

  it("uses Networks metadata for telegram channel networks tab", async () => {
    currentPathname = "/telegram-channels";
    currentSearch = "tab=networks";

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Networks · Telegram System");
    });
    expectEmojiFavicon("🕸️");
  });

  it("updates title and favicon after async channel override appears", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230ea5e9'/%3E%3C/svg%3E";

    const view = renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Posts · Telegram System");
    });
    expectEmojiFavicon("✈️");

    view.rerender(
      <TabIdentityProvider>
        <PageTabHead
          title="Posts · Test Channel · Telegram System"
          iconUrl={channelIcon}
          emoji="✈️"
          color="#1d4ed8"
        />
      </TabIdentityProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · Test Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);
  });

  it("updates title and favicon when switching from first channel to second", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1";
    const firstIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230ea5e9'/%3E%3C/svg%3E";
    const secondIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f97316'/%3E%3C/svg%3E";

    const view = renderWithTabProvider(
      <PageTabHead title="Posts · First Channel · Telegram System" iconUrl={firstIcon} />,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · First Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(firstIcon);

    view.rerender(
      <TabIdentityProvider>
        <PageTabHead title="Posts · Second Channel · Telegram System" iconUrl={secondIcon} />
      </TabIdentityProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · Second Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(secondIcon);
  });

  it("restores current route metadata after dynamic override unmount", async () => {
    currentPathname = "/finance";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23059669'/%3E%3C/svg%3E";
    const view = renderWithTabProvider(
      <PageTabHead title="Posts · Temp Channel · Telegram System" iconUrl={channelIcon} />,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · Temp Channel · Telegram System");
    });

    view.rerender(<TabIdentityProvider>{null}</TabIdentityProvider>);

    await waitFor(() => {
      expect(document.title).toBe("Finance · Telegram System");
    });
    expectEmojiFavicon("💰");
  });

  it("does not create duplicate favicon links across rerenders", async () => {
    currentPathname = "/finance";
    const view = renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Finance · Telegram System");
    });

    view.rerender(<TabIdentityProvider>{null}</TabIdentityProvider>);
    view.rerender(<TabIdentityProvider>{null}</TabIdentityProvider>);

    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="shortcut icon"]')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(1);
  });

  it("replaces channel avatar favicon with Finance emoji when leaving channel page", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23eab308'/%3E%3C/svg%3E";
    const view = renderWithTabProvider(
      <PageTabHead title="Posts · Test Channel · Telegram System" iconUrl={channelIcon} />,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · Test Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);

    currentPathname = "/finance";
    currentSearch = "";
    view.rerender(<TabIdentityProvider>{null}</TabIdentityProvider>);

    await waitFor(() => {
      expect(document.title).toBe("Finance · Telegram System");
    });
    expectEmojiFavicon("💰");
  });

  it("applies correct title and favicon after hard reload style async data hydration", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1&postView=calendar";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23a855f7'/%3E%3C/svg%3E";
    const view = renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Calendar · Telegram System");
    });
    expectEmojiFavicon("🗓️");

    view.rerender(
      <TabIdentityProvider>
        <PageTabHead
          title="Calendar · Reloaded Channel · Telegram System"
          iconUrl={channelIcon}
          emoji="🗓️"
          color="#7c2d12"
        />
      </TabIdentityProvider>,
    );

    await waitFor(() => {
      expect(document.title).toBe("Calendar · Reloaded Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);
  });

  it("uses Calendar metadata for canonical telegram post calendar routes", async () => {
    currentPathname = "/telegram-posts/channel-1/calendar";
    currentSearch = "";

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Calendar · Telegram System");
    });
    expectEmojiFavicon("🗓️");
  });

  it("uses cached route identity for canonical telegram post routes", async () => {
    currentPathname = "/telegram-posts/channel-1/editor";
    currentSearch = "postId=post-1";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%232563eb'/%3E%3C/svg%3E";
    const cacheKey = buildRouteTabIdentityCacheKey({
      pathname: currentPathname,
      searchParams: new URLSearchParams(currentSearch),
    });

    window.sessionStorage.setItem(
      `tab-identity:route:${encodeURIComponent(cacheKey)}`,
      JSON.stringify({
        title: "Posts · Cached Canonical Channel · Telegram System",
        emoji: "✈️",
        color: "#1d4ed8",
        iconUrl: channelIcon,
      }),
    );

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Posts · Cached Canonical Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);
  });

  it("uses cached route identity immediately on hard reload before channel query resolves", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1&postView=calendar";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2314b8a6'/%3E%3C/svg%3E";
    const cacheKey = buildRouteTabIdentityCacheKey({
      pathname: currentPathname,
      searchParams: new URLSearchParams(currentSearch),
    });

    window.sessionStorage.setItem(
      `tab-identity:route:${encodeURIComponent(cacheKey)}`,
      JSON.stringify({
        title: "Calendar · Cached Channel · Telegram System",
        emoji: "🗓️",
        color: "#7c2d12",
        iconUrl: channelIcon,
      }),
    );

    renderWithTabProvider();

    await waitFor(() => {
      expect(document.title).toBe("Calendar · Cached Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);
  });

  it("restores channel title and favicon if head is overwritten after reload hydration", async () => {
    currentPathname = "/telegram-posts";
    currentSearch = "channelId=channel-1&postView=editor";
    const channelIcon =
      "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230f766e'/%3E%3C/svg%3E";

    renderWithTabProvider(
      <PageTabHead
        title="Posts · Business Channel · Telegram System"
        iconUrl={channelIcon}
        emoji="✈️"
        color="#1d4ed8"
      />,
    );

    await waitFor(() => {
      expect(document.title).toBe("Posts · Business Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);

    document.title = "Telegram System";
    for (const rel of ["icon", "shortcut icon", "apple-touch-icon"] as const) {
      const link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
      if (link) {
        link.setAttribute("href", "/favicon.ico");
        link.setAttribute("type", "image/x-icon");
      }
    }

    await waitFor(() => {
      expect(document.title).toBe("Posts · Business Channel · Telegram System");
    });
    expect(iconHref("icon")).toBe(channelIcon);
  });

  it("keeps a valid favicon in React Strict Mode", async () => {
    currentPathname = "/finance";

    render(
      <StrictMode>
        <TabIdentityProvider>{null}</TabIdentityProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(document.title).toBe("Finance · Telegram System");
    });

    for (const rel of ["icon", "shortcut icon", "apple-touch-icon"] as const) {
      expect(iconHref(rel)).toBeTruthy();
    }
    expectEmojiFavicon("💰");
  });
});
