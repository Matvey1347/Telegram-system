'use client';

import Link from 'next/link';
import { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logout } from '@/lib/auth';
import { iconsApi, workspacesApi } from '@/lib/api';
import { CustomSelect } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Coins,
  CreditCard,
  FolderTree,
  Landmark,
  LayoutDashboard,
  LogOut,
  Plus,
  Megaphone,
  MessageCircle,
  RadioTower,
  ReceiptText,
  Settings,
  Target,
  UserRound,
  Users,
} from 'lucide-react';

const dashboardItem = { label: 'Dashboard', href: '/', icon: LayoutDashboard } as const;

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
      { label: 'Promos', href: '/promos', icon: Megaphone },
      { label: 'Ad Campaigns', href: '/ad-campaigns', icon: Target },
    ],
  },
  {
    key: 'workspace',
    label: 'Workspace',
    icon: Users,
    children: [
      { label: 'Members', href: '/workspace-members', icon: Users },
      { label: 'My Profile', href: '/account', icon: UserRound },
    ],
  },
] as const;

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const qc = useQueryClient();
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('selected-workspace-id') ?? '';
  });
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list });
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
      qc.invalidateQueries();
    },
  });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const defaults = { finance: false, telegram: false, workspace: false };
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
    if (!workspaces?.length) return;
    if (selectedWorkspaceId && workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) return;
    const nextWorkspaceId = workspaces[0].id;
    localStorage.setItem('selected-workspace-id', nextWorkspaceId);
    setSelectedWorkspaceId(nextWorkspaceId);
  }, [selectedWorkspaceId, workspaces]);

  const switchWorkspace = (workspaceId: string) => {
    localStorage.setItem('selected-workspace-id', workspaceId);
    setSelectedWorkspaceId(workspaceId);
    qc.invalidateQueries();
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar-open-groups', JSON.stringify(next));
      return next;
    });
  };
  const settingsActive = pathname === '/settings';
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
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-neutral-800 bg-neutral-950 p-5">
        <div className="mb-8">
          <h1 className="text-xl font-semibold">Telegram System</h1>
          <p className="mt-1 text-sm text-neutral-400">Finance, ads and analytics</p>
        </div>

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

        <button onClick={logout} className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"><LogOut size={16} /> Logout</button>
      </aside>
      <main className="ml-64 min-h-screen w-[calc(100%-16rem)] min-w-0 px-4 py-5 2xl:px-5"><div className="w-full min-w-0">{children}</div></main>
    </div>
  );
}
