'use client';

import Link from 'next/link';
import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logout } from '@/lib/auth';
import { accountApi, globalSearchApi, iconsApi, workspacesApi, type GlobalSearchResult } from '@/lib/api';
import { clearPersistedQueryCache, isWorkspaceScopedQuery } from '@/providers/query-provider';
import { CustomSelect } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';
import { IconAvatar } from '@/components/icons/icon-avatar';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Coins,
  CreditCard,
  FolderTree,
  Gauge,
  Landmark,
  LogOut,
  Menu,
  Plus,
  Search,
  MessageCircle,
  Send,
  RadioTower,
  ReceiptText,
  Settings,
  Target,
  X,
} from 'lucide-react';

const dashboardItem = { label: 'Dashboard', href: '/', icon: Gauge } as const;

const groups = [
  {
    key: 'finance',
    label: 'Finance',
    icon: Landmark,
    children: [
      { label: 'Accounts', href: '/accounts', icon: CreditCard },
      { label: 'Transactions', href: '/transactions', icon: ReceiptText },
      { label: 'Categories', href: '/categories', icon: FolderTree },
      { label: 'Transfers', href: '/transfers', icon: ArrowRightLeft },
      { label: 'Currencies', href: '/currencies', icon: Coins },
    ],
  },
  {
    key: 'telegram',
    label: 'Telegram',
    icon: MessageCircle,
    children: [
      { label: 'Telegram', href: '/telegram-channels', icon: RadioTower },
      { label: 'Posts', href: '/telegram-posts', icon: Send },
      { label: 'Ads', href: '/ad-campaigns', icon: Target },
    ],
  },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('selected-workspace-id') ?? '';
  });
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list });
  const { data: currentAccount } = useQuery({ queryKey: ['account-me'], queryFn: accountApi.me });
  const { data: searchResults = [], isFetching: searchFetching } = useQuery({
    queryKey: ['global-search', debouncedGlobalSearch],
    queryFn: () => globalSearchApi.search(debouncedGlobalSearch),
    enabled: debouncedGlobalSearch.trim().length >= 2,
  });
  const createWorkspace = useMutation({
    mutationFn: async (payload: { name: string; avatarIconId?: string | null }) => {
      const selectedIcon = payload.avatarIconId ? await iconsApi.get(payload.avatarIconId).catch(() => null) : null;
      const created = await workspacesApi.create({ name: payload.name });
      if (!selectedIcon) return created;

      localStorage.setItem('selected-workspace-id', created.id);
      setSelectedWorkspaceId(created.id);

      const clonedIcon =
        selectedIcon.type === 'emoji'
          ? await iconsApi.createEmoji({
              name: selectedIcon.name,
              emoji: selectedIcon.emoji ?? '',
            }).catch(() => null)
          : selectedIcon.imageUrl
            ? await iconsApi.createCustom({
                name: selectedIcon.name,
                imageUrl: selectedIcon.imageUrl,
              }).catch(() => null)
            : null;

      if (!clonedIcon) return created;

      try {
        return await workspacesApi.update(created.id, { avatarIconId: clonedIcon.id });
      } catch {
        return created;
      }
    },
    onSuccess: (workspace) => {
      localStorage.setItem('selected-workspace-id', workspace.id);
      setSelectedWorkspaceId(workspace.id);
      setWorkspaceName('');
      setWorkspaceIconId(null);
      setCreatingWorkspace(false);
      clearPersistedQueryCache();
      qc.removeQueries({ predicate: (query) => isWorkspaceScopedQuery(query.queryKey) });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const defaults = { finance: false, telegram: false };
    if (typeof window === 'undefined') return defaults;
    try {
      const raw = localStorage.getItem('sidebar-open-groups');
      if (!raw) return defaults;
      return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) };
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem('sidebar-open-groups', JSON.stringify(openGroups));
  }, [openGroups]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedGlobalSearch(globalSearch.trim()), 220);
    return () => window.clearTimeout(timeout);
  }, [globalSearch]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!workspaces?.length) return;
    if (selectedWorkspaceId && workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) return;
    const nextWorkspaceId = workspaces[0].id;
    localStorage.setItem('selected-workspace-id', nextWorkspaceId);
    // Workspace list supplies the initial selected workspace fallback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedWorkspaceId(nextWorkspaceId);
  }, [selectedWorkspaceId, workspaces]);

  const switchWorkspace = (workspaceId: string) => {
    localStorage.setItem('selected-workspace-id', workspaceId);
    setSelectedWorkspaceId(workspaceId);
    clearPersistedQueryCache();
    qc.removeQueries({ predicate: (query) => isWorkspaceScopedQuery(query.queryKey) });
    qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    qc.invalidateQueries({ queryKey: ['workspaces'] });
  };

  const handleLogout = () => {
    qc.clear();
    clearPersistedQueryCache();
    logout();
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar-open-groups', JSON.stringify(next));
      return next;
    });
  };
  const settingsActive =
    pathname === '/settings' || pathname === '/workspace-members';
  const dashboardActive = pathname === '/';
  const activeWorkspaceId = selectedWorkspaceId || workspaces?.[0]?.id || '';

  const groupActiveMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const group of groups) {
      map[group.key] =
        group.key === 'finance'
          ? pathname === '/finance' || group.children.some((item) => pathname === item.href)
          : group.children.some((item) => pathname === item.href);
    }
    return map;
  }, [pathname]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-semibold">Telegram System</span>
        <span className="h-10 w-10" aria-hidden="true" />
      </header>
      {mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/65 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-[100dvh] w-[min(19rem,calc(100vw-1.25rem))] -translate-x-full flex-col border-r border-neutral-800 bg-neutral-950 p-4 shadow-2xl transition-transform duration-200 lg:z-30 lg:h-screen lg:w-64 lg:translate-x-0 lg:p-5 lg:shadow-none ${mobileMenuOpen ? 'translate-x-0' : ''}`}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest('a')) setMobileMenuOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 hover:bg-neutral-900 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <div className="mb-8">
          <h1 className="pr-10 text-xl font-semibold lg:pr-0">Telegram System</h1>
          <p className="mt-1 text-sm text-neutral-400">Finance, ads and analytics</p>
        </div>

        <GlobalSearchBox
          query={globalSearch}
          onQueryChange={setGlobalSearch}
          focused={searchFocused}
          onFocusedChange={setSearchFocused}
          results={searchResults}
          isFetching={searchFetching}
        />

        <div className="mb-5 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
          <div className="flex items-center justify-between gap-2 text-xs uppercase text-neutral-500">
            <span>Workspace</span>
            <button type="button" onClick={() => setCreatingWorkspace((v) => !v)} className="rounded p-1 text-neutral-300 hover:bg-neutral-800" aria-label="Create workspace"><Plus size={14} /></button>
          </div>
          <CustomSelect
            value={activeWorkspaceId}
            onChange={switchWorkspace}
            placeholder="Select workspace"
            options={(workspaces ?? []).map((workspace) => ({
              value: workspace.id,
              label: `${workspace.name} (${workspace.role})`,
              iconUrl: workspace.avatarIcon?.imageUrl ?? undefined,
              iconEmoji: workspace.avatarIcon?.emoji ?? undefined,
            }))}
          />
          {creatingWorkspace ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = workspaceName.trim();
                if (name) createWorkspace.mutate({ name, avatarIconId: workspaceIconId });
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <IconPicker compact iconId={workspaceIconId} onChange={setWorkspaceIconId} />
                <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Workspace name" className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm outline-none focus:border-neutral-500" />
              </div>
              <button type="submit" className="rounded-md border border-neutral-700 px-2 text-sm text-neutral-200 hover:bg-neutral-800">Add</button>
            </form>
          ) : null}
        </div>

        <nav className="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <Link href={dashboardItem.href} className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${dashboardActive ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'}`}>
            <dashboardItem.icon size={16} />
            {dashboardItem.label}
          </Link>

          {groups.map((group) => {
            const groupActive = groupActiveMap[group.key];
            const GroupIcon = group.icon;
            const isOpen = openGroups[group.key];

            return (
              <div key={group.label} className="space-y-1 border-b border-neutral-900 pb-3 last:border-b-0">
                <div className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-neutral-900">
                  {group.key === 'finance' ? (
                    <Link
                      href="/finance"
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-xs uppercase tracking-wide ${groupActive ? 'text-neutral-200' : 'text-neutral-500'} hover:text-white`}
                    >
                      <GroupIcon size={14} />
                      <span className="truncate">{group.label}</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-xs uppercase tracking-wide ${groupActive ? 'text-neutral-200' : 'text-neutral-500'} hover:text-white`}
                    >
                      <GroupIcon size={14} />
                      <span className="truncate">{group.label}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className={`rounded-md p-1 ${groupActive ? 'text-neutral-200' : 'text-neutral-500'} hover:bg-neutral-800 hover:text-white`}
                    aria-label={`Toggle ${group.label}`}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
                {isOpen ? group.children.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className={`ml-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${pathname === item.href ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'}`}>
                      <ItemIcon size={16} />
                      {item.label}
                    </Link>
                  );
                }) : null}
              </div>
            );
          })}

          <Link href="/settings" className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ${settingsActive ? 'bg-neutral-800 text-white' : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'}`}>
            <Settings size={16} />
            Settings
          </Link>
        </nav>

        <div className="mt-5 border-t border-neutral-800 pt-4">
          <Link
            href="/account"
            className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
              pathname === '/account'
                ? 'border-blue-700/70 bg-blue-950/30'
                : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            <IconAvatar
              icon={currentAccount?.avatarIcon}
              label={currentAccount?.name || currentAccount?.email || 'User'}
              size="md"
              className="!rounded-full"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {currentAccount?.name || 'My profile'}
              </span>
              <span className="block truncate text-xs text-neutral-500">
                {currentAccount?.email || 'Account settings'}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-neutral-500" />
          </Link>
          <button onClick={handleLogout} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 hover:text-white"><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <main className="min-h-[calc(100dvh-3.5rem)] min-w-0 px-3 py-4 sm:px-4 sm:py-5 lg:ml-64 lg:min-h-screen lg:w-[calc(100%-16rem)] 2xl:px-5"><div className="w-full min-w-0">{children}</div></main>
    </div>
  );
}

function SearchResultIcon({ result }: { result: GlobalSearchResult }) {
  if (result.iconUrl) return <img src={result.iconUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />;
  if (result.iconEmoji) return <span className="flex h-7 w-7 shrink-0 items-center justify-center text-base">{result.iconEmoji}</span>;
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-xs font-semibold text-neutral-200">
      {(result.title.trim()[0] || result.label.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

function GlobalSearchBox({
  query,
  onQueryChange,
  focused,
  onFocusedChange,
  results,
  isFetching,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  focused: boolean;
  onFocusedChange: (value: boolean) => void;
  results: GlobalSearchResult[];
  isFetching: boolean;
}) {
  const showResults = focused && query.trim().length >= 2;
  return (
    <div className="relative mb-4">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => onFocusedChange(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onFocusedChange(false);
          }}
          placeholder="Search everything"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 py-2 pl-9 pr-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />
      </div>
      {showResults ? (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-2xl"
          onMouseDown={(event) => event.preventDefault()}
        >
          {isFetching ? <p className="px-3 py-2 text-sm text-neutral-400">Searching...</p> : null}
          {!isFetching && results.length ? (
            <div className="space-y-1">
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  onClick={() => {
                    onFocusedChange(false);
                    onQueryChange('');
                  }}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                >
                  <SearchResultIcon result={result} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-white">{result.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{result.label}{result.subtitle ? ` · ${result.subtitle}` : ''}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {!isFetching && !results.length ? (
            <p className="px-3 py-2 text-sm text-neutral-400">No results</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
