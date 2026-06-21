'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { Button, Card, ConfirmDeleteModal, Input, LoadingState, PageHeader } from '@/components/ui/primitives';
import { accountApi, authApi, getDashboardSummary, workspacesApi } from '@/lib/api';

export default function SettingsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me-settings'], queryFn: authApi.me });
  const summary = useQuery({ queryKey: ['dashboard-settings'], queryFn: getDashboardSummary });
  const { data: workspaces } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list });
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceIconId, setWorkspaceIconId] = useState<string | null>(null);
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);
  const workspaceMutation = useMutation({
    mutationFn: accountApi.updateWorkspace,
    onSuccess: () => me.refetch(),
  });
  const deleteWorkspaceMutation = useMutation({
    mutationFn: workspacesApi.remove,
    onSuccess: async () => {
      const currentWorkspaceId = me.data?.workspace.id;
      const remainingWorkspaceId = workspaces?.find((workspace) => workspace.id !== currentWorkspaceId)?.id ?? '';
      if (remainingWorkspaceId) {
        localStorage.setItem('selected-workspace-id', remainingWorkspaceId);
      } else {
        localStorage.removeItem('selected-workspace-id');
      }
      setWorkspaceDeleteOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['workspaces'] }),
        qc.invalidateQueries({ queryKey: ['me-settings'] }),
        qc.invalidateQueries({ queryKey: ['dashboard-settings'] }),
      ]);
      if (!remainingWorkspaceId && typeof window !== 'undefined') {
        window.location.reload();
      }
    },
  });

  useEffect(() => {
    if (!me.data?.workspace) return;
    setWorkspaceName(me.data.workspace.name);
    setWorkspaceIconId(me.data.workspace.avatarIcon?.id ?? null);
  }, [me.data]);

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="MVP account and workspace info" />
      {me.isLoading ? <LoadingState /> : null}
      {me.data ? (
        <Card>
          <h3 className="text-lg font-semibold">Current User</h3>
          <p className="mt-2 text-sm">Name: {me.data.user.name}</p>
          <p className="text-sm">Email: {me.data.user.email}</p>
          <p className="text-sm">Workspace: {me.data.workspace.name}</p>
          <p className="text-sm">Role: {me.data.workspace.role}</p>
        </Card>
      ) : null}
      <div className="mt-4">
        <Card>
          <h3 className="text-lg font-semibold">Workspace</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <InlineIconPicker iconId={workspaceIconId} onChange={setWorkspaceIconId} className="text-2xl" />
              <div>
                <p className="text-sm font-medium">{me.data?.workspace.name}</p>
                <p className="text-xs text-neutral-400">Workspace avatar and name</p>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-300">Workspace name</label>
              <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-neutral-400">Campaign count: {summary.data?.bestCampaigns?.length ?? 0}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  onClick={() => setWorkspaceDeleteOpen(true)}
                  disabled={deleteWorkspaceMutation.isPending}
                >
                  Delete
                </Button>
                <Button
                  onClick={() => workspaceMutation.mutate({ name: workspaceName.trim(), avatarIconId: workspaceIconId })}
                  disabled={!workspaceName.trim() || workspaceMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <ConfirmDeleteModal
        open={workspaceDeleteOpen}
        onClose={() => setWorkspaceDeleteOpen(false)}
        onConfirm={() => {
          if (!me.data?.workspace.id) return;
          deleteWorkspaceMutation.mutate(me.data.workspace.id);
        }}
        entityName={me.data?.workspace.name ?? 'workspace'}
        label="Delete workspace"
        description="This will delete your channels, transactions, accounts, categories, members, and other data in this workspace. Advertising channels, promos, and ad campaigns are kept as part of the workspace cleanup scope and will not be removed outside this workspace."
      />
    </AppShell>
  );
}
