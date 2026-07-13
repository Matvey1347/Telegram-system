"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ChannelPreview } from "@/components/telegram/channel-preview";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import {
  telegramBotsApi,
  telegramUserAccountsApi,
  type TelegramBot,
  type TelegramSourceChannelAccess,
  type TelegramSyncedDialogChannel,
  type TelegramUserAccount,
  type TelegramUserAccountSyncDialogsResponse,
} from "@/lib/api";
import { scheduleProgressDismiss } from "@/lib/progress";
import {
  Button,
  ConfirmDeleteModal,
  EmptyState,
  EntityCard,
  FormField,
  IconButton,
  Input,
  LoadingState,
  MasonryGrid,
  Modal,
  TooltipBubble,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";

function errorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}

function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (message: string, tone: ToastItem["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      3500,
    );
  };
  return { toasts, setToasts, pushToast };
}

function invalidateTelegramAccess(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["telegram-user-accounts"] });
  qc.invalidateQueries({ queryKey: ["telegram-bots"] });
  qc.invalidateQueries({ queryKey: ["telegram-source-channels"] });
  qc.invalidateQueries({ queryKey: ["telegram-channel-sources"] });
  qc.invalidateQueries({ queryKey: ["telegram-channel-analytics-sources"] });
  qc.invalidateQueries({ queryKey: ["telegram-channels"] });
}

export function MtprotoAccountsPanel({
  createOpen,
  onCreateClose,
}: {
  createOpen: boolean;
  onCreateClose: () => void;
}) {
  const qc = useQueryClient();
  const { setProgress, clearProgress } = useAppToast();
  const [codeTarget, setCodeTarget] = useState<TelegramUserAccount | null>(
    null,
  );
  const [passwordTarget, setPasswordTarget] =
    useState<TelegramUserAccount | null>(null);
  const [deleting, setDeleting] = useState<TelegramUserAccount | null>(null);
  const [syncReview, setSyncReview] = useState<{
    account: TelegramUserAccount;
    response: TelegramUserAccountSyncDialogsResponse;
  } | null>(null);
  const { toasts, setToasts, pushToast } = useToasts();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["telegram-user-accounts"],
    queryFn: telegramUserAccountsApi.list,
  });

  const startLoginMutation = useMutation({
    mutationFn: ({ id, phone }: { id: string; phone?: string }) =>
      telegramUserAccountsApi.startLogin(id, phone),
    onSuccess: (_response, variables) => {
      invalidateTelegramAccess(qc);
      setCodeTarget(
        data.find((account) => account.id === variables.id) || null,
      );
      pushToast("Code sent. Enter login code.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to start login."), "error"),
  });
  const createMutation = useMutation({
    mutationFn: telegramUserAccountsApi.create,
    onSuccess: (account: TelegramUserAccount) => {
      invalidateTelegramAccess(qc);
      onCreateClose();
      startLoginMutation.mutate({ id: account.id });
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to create account."), "error"),
  });
  const checkMutation = useMutation({
    mutationFn: (id: string) => telegramUserAccountsApi.check(id),
    onSuccess: () => {
      invalidateTelegramAccess(qc);
      pushToast("Account checked.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to check account."), "error"),
  });
  const syncMutation = useMutation<
    { accountId: string; response: TelegramUserAccountSyncDialogsResponse },
    unknown,
    TelegramUserAccount
  >({
    mutationFn: async (account: TelegramUserAccount) => {
      const progressId = `telegram-user-sync:${account.id}`;
      setProgress({
        id: progressId,
        title: `Sync ${accountDisplayName(account)}`,
        current: 0,
        total: 3,
        message: "Starting sync…",
        iconUrl: account.photoUrl || undefined,
      });
      try {
        const response = await telegramUserAccountsApi.syncDialogsWithProgress(
          account.id,
          (item: { message?: string }, current, total) => {
            setProgress({
              id: progressId,
              title: `Sync ${accountDisplayName(account)}`,
              current,
              total,
              message: item.message || "Syncing Telegram channels…",
              iconUrl: account.photoUrl || undefined,
            });
          },
        );
        setProgress({
          id: progressId,
          title: `Sync ${accountDisplayName(account)}`,
          current: 3,
          total: 3,
          message: "Channel sync completed",
          completed: true,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          iconUrl: account.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return { accountId: account.id, response };
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: ({ accountId, response }) => {
      invalidateTelegramAccess(qc);
      const account = data.find((item) => item.id === accountId);
      if (account) setSyncReview({ account, response });
      pushToast(response.message || "Admin channels synced.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to sync admin channels."), "error"),
  });
  const importChannelsMutation = useMutation<
    TelegramUserAccountSyncDialogsResponse,
    unknown,
    { account: TelegramUserAccount; channelIds: string[] }
  >({
    mutationFn: async ({
      account,
      channelIds,
    }: {
      account: TelegramUserAccount;
      channelIds: string[];
    }) => {
      const progressId = `telegram-user-import:${account.id}:${Date.now()}`;
      setProgress({
        id: progressId,
        title: `Import from ${accountDisplayName(account)}`,
        current: 0,
        total: Math.max(1, 1 + channelIds.length * 2),
        message: "Starting import…",
        iconUrl: account.photoUrl || undefined,
      });
      try {
        const response =
          await telegramUserAccountsApi.importChannelsWithProgress(
            account.id,
            channelIds,
            (item: { message?: string }, current, total) => {
              setProgress({
                id: progressId,
                title: `Import from ${accountDisplayName(account)}`,
                current,
                total,
                message: item.message || "Importing Telegram channels…",
                iconUrl: account.photoUrl || undefined,
              });
            },
          );
        setProgress({
          id: progressId,
          title: `Import from ${accountDisplayName(account)}`,
          current: Math.max(1, 1 + channelIds.length * 2),
          total: Math.max(1, 1 + channelIds.length * 2),
          message: "Channel import completed",
          completed: true,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          iconUrl: account.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return response;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: (response) => {
      invalidateTelegramAccess(qc);
      setSyncReview(null);
      pushToast(response.message || "Channels added.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to add channels."), "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramUserAccountsApi.remove(id),
    onSuccess: () => {
      invalidateTelegramAccess(qc);
      setDeleting(null);
      pushToast("Account deleted.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to delete account."), "error"),
  });

  return (
    <>
      {isLoading ? <LoadingState /> : null}
      <MasonryGrid>
        {data.map((account) => {
          const username = String(account.username || "").replace("@", "");
          const fullName = [account.firstName, account.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          return (
            <EntityCard key={account.id} title="" actions={null}>
              <ChannelPreview
                channel={{
                  title: username ? `@${username}` : account.label,
                  photoUrl: account.photoUrl,
                }}
                avatarKind="mtproto"
                subtitle={fullName || `Phone: ${account.phoneMasked || "-"}`}
                rightAction={
                  <IconButton
                    kind="delete"
                    onClick={() => setDeleting(account)}
                  />
                }
              />
              {account.status !== "connected" ? (
                <div className="mb-1 mt-3 flex items-center gap-2 text-xs uppercase tracking-wide text-amber-300">
                  Status: {account.status}
                </div>
              ) : null}
              <div className="mt-3 space-y-1 text-sm">
                <p>Phone: {account.phoneMasked || "-"}</p>
                <p>
                  Last Check:{" "}
                  {account.lastCheckedAt
                    ? new Date(account.lastCheckedAt).toLocaleString()
                    : "-"}
                </p>
                {account.lastErrorMessage ? (
                  <p className="text-rose-300">{account.lastErrorMessage}</p>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {account.status !== "connected" ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      startLoginMutation.mutate({ id: account.id })
                    }
                  >
                    Start login
                  </Button>
                ) : null}
                {account.status !== "connected" ? (
                  <Button
                    variant="secondary"
                    onClick={() => setCodeTarget(account)}
                  >
                    Enter code
                  </Button>
                ) : null}
                {account.status === "needs_password" ? (
                  <Button
                    variant="secondary"
                    onClick={() => setPasswordTarget(account)}
                  >
                    2FA password
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => checkMutation.mutate(account.id)}
                >
                  Check
                </Button>
                  <Button onClick={() => syncMutation.mutate(account)}>
                    Sync channels
                  </Button>
              </div>
              <SourceChannelsList
                sourceId={account.id}
                sourceType="MTPROTO"
                queryFn={() => telegramUserAccountsApi.channels(account.id)}
              />
            </EntityCard>
          );
        })}
      </MasonryGrid>
      {!isLoading && !error && !data.length ? (
        <EmptyState text="No MTProto accounts" />
      ) : null}
      <CreateMtprotoModal
        open={createOpen}
        onClose={onCreateClose}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <CodeModal
        open={!!codeTarget}
        account={codeTarget}
        onClose={() => setCodeTarget(null)}
        onNeedPassword={() => {
          setPasswordTarget(codeTarget);
          setCodeTarget(null);
        }}
        onDone={() => {
          invalidateTelegramAccess(qc);
          setCodeTarget(null);
        }}
        pushToast={pushToast}
      />
      <PasswordModal
        open={!!passwordTarget}
        account={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onDone={() => {
          invalidateTelegramAccess(qc);
          setPasswordTarget(null);
        }}
        pushToast={pushToast}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.label || ""}
        description="This will remove Telegram user session for this workspace."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting ? deleteMutation.mutateAsync(deleting.id) : undefined}
        label="Delete"
      />
      <SyncChannelsReviewModal
        review={syncReview}
        isSaving={importChannelsMutation.isPending}
        onClose={() => setSyncReview(null)}
        onSubmit={(channelIds) =>
          syncReview &&
          importChannelsMutation.mutate({
            account: syncReview.account,
            channelIds,
          })
        }
      />
      <ToastStack
        items={toasts}
        onClose={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />
    </>
  );
}

export function BotAccountsPanel({
  createOpen,
  onCreateClose,
}: {
  createOpen: boolean;
  onCreateClose: () => void;
}) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<TelegramBot | null>(null);
  const { toasts, setToasts, pushToast } = useToasts();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["telegram-bots"],
    queryFn: telegramBotsApi.list,
  });
  const createMutation = useMutation({
    mutationFn: telegramBotsApi.create,
    onSuccess: () => {
      invalidateTelegramAccess(qc);
      onCreateClose();
      pushToast("Bot connected and channel access synced.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to connect bot."), "error"),
  });
  const checkMutation = useMutation({
    mutationFn: (id: string) => telegramBotsApi.check(id),
    onSuccess: () => {
      invalidateTelegramAccess(qc);
      pushToast("Bot checked and channel access synced.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to check bot."), "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramBotsApi.remove(id),
    onSuccess: () => {
      invalidateTelegramAccess(qc);
      setDeleting(null);
      pushToast("Bot deleted.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to delete bot."), "error"),
  });

  return (
    <>
      {isLoading ? <LoadingState /> : null}
      <MasonryGrid>
        {data.map((bot) => (
          <EntityCard key={bot.id} title="" actions={null}>
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-neutral-700 bg-slate-900/70 p-3">
              <TelegramEntityAvatar
                kind="bot"
                alt={bot.firstName || bot.label}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold leading-none text-white">
                  {bot.firstName || bot.label}
                </p>
                <p className="mt-1 truncate text-sm text-slate-300">
                  {bot.username ? `@${bot.username}` : bot.botTokenMasked}
                </p>
              </div>
              <IconButton kind="delete" onClick={() => setDeleting(bot)} />
            </div>
            <div className="space-y-1 text-sm">
              <p>Token: {bot.botTokenMasked}</p>
              <p>
                Last Check:{" "}
                {bot.lastCheckedAt
                  ? new Date(bot.lastCheckedAt).toLocaleString()
                  : "-"}
              </p>
            </div>
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() => checkMutation.mutate(bot.id)}
              >
                Check
              </Button>
            </div>
            <SourceChannelsList
              sourceId={bot.id}
              sourceType="BOT"
              queryFn={() => telegramBotsApi.channels(bot.id)}
            />
          </EntityCard>
        ))}
      </MasonryGrid>
      {!isLoading && !error && !data.length ? <EmptyState text="No bots" /> : null}
      <CreateBotModal
        open={createOpen}
        onClose={onCreateClose}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.label || ""}
        description="This removes the bot token from this workspace."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting ? deleteMutation.mutateAsync(deleting.id) : undefined}
        label="Delete"
      />
      <ToastStack
        items={toasts}
        onClose={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />
    </>
  );
}

function SyncChannelsReviewModal({
  review,
  isSaving,
  onClose,
  onSubmit,
}: {
  review: {
    account: TelegramUserAccount;
    response: TelegramUserAccountSyncDialogsResponse;
  } | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (channelIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    setSelectedIds([]);
  }, [review?.account.id, review?.response]);
  if (!review) return null;

  const syncedChannels = review.response.syncedChannels || [];
  const availableChannels = review.response.availableChannels || [];
  const accountName = accountDisplayName(review.account);
  const allSelected =
    availableChannels.length > 0 &&
    selectedIds.length === availableChannels.length;
  const toggleChannel = (channelId: string) => {
    setSelectedIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((item) => item !== channelId)
        : [...prev, channelId],
    );
  };
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : availableChannels.map((c) => c.channelId));
  };

  return (
    <Modal
      open={!!review}
      onClose={onClose}
      title={`Sync channels: ${accountName}`}
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">
                {syncedChannels.length} synchronized
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Existing workspace channels linked to {accountName}.
              </p>
            </div>
            <AccessBadge
              label={`${availableChannels.length} new`}
              tip="Channels found in this Telegram account that are not in this workspace yet."
              tone="info"
            />
          </div>
          {syncedChannels.length ? (
            <div className="mt-3 space-y-2">
              {syncedChannels.map((channel) => (
                <SyncedDialogChannelRow key={channel.channelId} channel={channel} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              No existing workspace channels matched this Telegram account.
            </p>
          )}
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">Add new channels</p>
              <p className="mt-1 text-xs text-slate-400">
                Selected channels will be created and linked to {accountName}.
              </p>
            </div>
            {availableChannels.length ? (
              <Button variant="secondary" type="button" onClick={toggleAll}>
                {allSelected ? "Clear" : "Select all"}
              </Button>
            ) : null}
          </div>
          {availableChannels.length ? (
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {availableChannels.map((channel) => {
                const checked = selectedIds.includes(channel.channelId);
                return (
                  <label
                    key={channel.channelId}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 ${
                      checked
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-slate-800 bg-slate-950/30 hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(channel.channelId)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <SyncedDialogChannelRow channel={channel} />
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No new admin channels found for this account.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!selectedIds.length || isSaving}
            onClick={() => onSubmit(selectedIds)}
          >
            {isSaving ? "Adding..." : `Add ${selectedIds.length || ""}`.trim()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SyncedDialogChannelRow({
  channel,
}: {
  channel: TelegramSyncedDialogChannel;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-100">{channel.title}</p>
        <p className="truncate text-xs text-slate-400">
          {channel.username ? `@${channel.username}` : channel.telegramChannelId}
        </p>
      </div>
      <AccessBadge
        label={formatRole(channel.role)}
        tip={roleTooltip(channel.role, "MTPROTO")}
      />
    </div>
  );
}

function accountDisplayName(account: TelegramUserAccount) {
  const username = String(account.username || "").replace("@", "");
  const fullName = [account.firstName, account.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return username ? `@${username}` : fullName || account.label;
}

function SourceChannelsList({
  sourceId,
  sourceType,
  queryFn,
}: {
  sourceId: string;
  sourceType: "BOT" | "MTPROTO";
  queryFn: () => Promise<TelegramSourceChannelAccess[]>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<TelegramSourceChannelAccess | null>(
    null,
  );
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["telegram-source-channels", sourceType, sourceId],
    queryFn,
  });
  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-0 py-1 text-left transition hover:text-blue-300"
      >
        <span className="text-sm font-semibold text-slate-200">
          Channel access
        </span>
        <span className="text-xs text-slate-400">
          {isLoading ? "Loading..." : `${data.length} channels`}
        </span>
      </button>
      <SourceChannelsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        channels={data}
        isLoading={isLoading}
        error={error}
        onSelect={setSelected}
      />
      <ChannelAccessModal
        access={selected}
        sourceType={sourceType}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function SourceChannelsModal({
  open,
  onClose,
  channels,
  isLoading,
  error,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  channels: TelegramSourceChannelAccess[];
  isLoading: boolean;
  error: unknown;
  onSelect: (channel: TelegramSourceChannelAccess) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Channel access">
      <div className="space-y-3">
        {isLoading ? <LoadingState /> : null}
        {!isLoading && !error && !channels.length ? (
          <EmptyState text="No synced channel access yet." />
        ) : null}
        {channels.map((channel) => (
          <button
            key={channel.channelId}
            type="button"
            onClick={() => onSelect(channel)}
            className="w-full rounded-md border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-600"
          >
            <div className="flex items-center gap-2">
              <TelegramEntityAvatar
                imageUrl={channel.avatarUrl}
                kind="channel"
                alt={channel.title}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {channel.title}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {channel.username
                    ? `@${channel.username}`
                    : channel.telegramChannelId || channel.channelId}
                </p>
              </div>
              <AccessBadge
                label={formatRole(channel.role)}
                tip={roleTooltip(channel.role, channel.sourceType)}
              />
            </div>
            <div
              className={`mt-2 flex flex-wrap items-center gap-1 text-xs ${channel.canBeUsedForAnalytics ? "text-emerald-300" : "text-amber-300"}`}
            >
              <span>
                {channel.canBeUsedForAnalytics
                  ? "Can be used for analytics"
                  : "Not enough access for analytics"}
              </span>
              <PermissionSummaryBadges
                permissions={channel.permissions}
                role={channel.role}
                sourceType={channel.sourceType}
              />
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ChannelAccessModal({
  access,
  sourceType,
  onClose,
}: {
  access: TelegramSourceChannelAccess | null;
  sourceType: "BOT" | "MTPROTO";
  onClose: () => void;
}) {
  if (!access) return null;
  const permissions = [
    ["Can create/publish posts", access.permissions.canPostMessages],
    ["Can edit posts", access.permissions.canEditMessages],
    ["Can delete posts", access.permissions.canDeleteMessages],
    ["Can invite users", access.permissions.canInviteUsers],
    ["Can manage invite links", access.permissions.canManageInviteLinks],
    ["Can view/export analytics", access.permissions.canViewStats],
  ] as const;
  return (
    <Modal open={!!access} onClose={onClose} title="Channel access">
      <div className="space-y-4 text-sm">
        <ChannelPreview
          channel={{
            title: access.title,
            username: access.username || undefined,
            telegramChatId: access.telegramChannelId || undefined,
            photoUrl: access.avatarUrl || undefined,
            currentSubscribersCount:
              access.currentSubscribersCount ?? undefined,
          }}
        />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <AccessField label="Source type" value={sourceType} />
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
            <p className="text-xs text-slate-400">Role</p>
            <div className="mt-1">
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, sourceType)}
              />
            </div>
          </div>
          <AccessField
            label="Channel ID"
            value={access.telegramChannelId || access.channelId}
          />
          <AccessField
            label="Analytics"
            value={
              access.canBeUsedForAnalytics
                ? "Can be used for analytics"
                : "Not enough access for analytics"
            }
          />
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 font-medium text-slate-200">Permissions</p>
          <p className="mb-3 text-xs text-slate-400">
            {inviteLinksVisibility(access.role, sourceType)}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {permissions.map(([label, enabled]) => (
              <p
                key={label}
                className={enabled ? "text-emerald-300" : "text-slate-500"}
              >
                {enabled ? "Yes" : "No"} · {label}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AccessField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium text-slate-100">{value || "-"}</p>
    </div>
  );
}

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function PermissionSummaryBadges({
  permissions,
  role,
  sourceType,
}: {
  permissions: TelegramSourceChannelAccess["permissions"];
  role: string;
  sourceType: string;
}) {
  const fullAccess = hasFullAccess(permissions, role);
  if (fullAccess) {
    return (
      <>
        <span className="text-slate-500">·</span>
        <AccessBadge
          label="Full access"
          tip={fullAccessTooltip(role, sourceType)}
          tone="success"
        />
        <AccessBadge
          label={inviteLinksBadgeLabel(role, sourceType)}
          tip={inviteLinksVisibility(role, sourceType)}
          tone="info"
        />
      </>
    );
  }
  const labels = [
    permissions.canPostMessages ? "post" : null,
    permissions.canEditMessages ? "edit" : null,
    permissions.canDeleteMessages ? "delete" : null,
    permissions.canManageInviteLinks
      ? inviteLinksBadgeLabel(role, sourceType)
      : null,
    permissions.canViewStats ? "stats" : null,
  ].filter(Boolean);
  return (
    <span>
      {labels.length ? `· ${labels.join(", ")}` : "· unknown permissions"}
    </span>
  );
}

function AccessBadge({
  label,
  tip,
  tone = "default",
}: {
  label: string;
  tip: string;
  tone?: "default" | "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-700 text-emerald-200"
      : tone === "info"
        ? "border-blue-700 text-blue-200"
        : "border-slate-700 text-slate-200";
  return (
    <span
      className={`group relative inline-flex rounded border px-2 py-0.5 text-xs ${toneClass}`}
    >
      {label}
      <TooltipBubble
        side="top"
        align="left"
        className="hidden w-64 border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        {tip}
      </TooltipBubble>
    </span>
  );
}

function hasFullAccess(
  permissions: TelegramSourceChannelAccess["permissions"],
  role: string,
) {
  return (
    role === "OWNER" ||
    (role === "ADMIN" &&
      permissions.canPostMessages &&
      permissions.canEditMessages &&
      permissions.canDeleteMessages &&
      permissions.canManageInviteLinks &&
      permissions.canViewStats)
  );
}

function roleTooltip(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Owner has the highest channel access: can manage posts, admins, stats, and all invite links when Telegram returns these permissions.";
  if (role === "ADMIN")
    return `Admin access depends on granted Telegram rights. This ${sourceType === "BOT" ? "bot" : "account"} may publish, edit, delete, invite, or view stats only if those rights are enabled.`;
  if (role === "MEMBER")
    return "Member access is not enough for analytics unless Telegram grants specific admin-level rights.";
  return "Unknown means Telegram did not return a clear channel role for this source.";
}

function fullAccessTooltip(role: string, sourceType: string) {
  const inviteLinks = inviteLinksVisibility(role, sourceType);
  return `Full access means this source has all meaningful analytics permissions currently tracked: publish, edit, delete, invite links, and stats. ${inviteLinks}`;
}

function inviteLinksBadgeLabel(role: string, sourceType: string) {
  if (role === "OWNER") return "All invite links";
  if (sourceType === "BOT") return "Own bot links only";
  return "Own admin links only";
}

function inviteLinksVisibility(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Invite links: owner access can see all channel invite links.";
  if (sourceType === "BOT")
    return "Invite links: bots can see only invite links created by this bot.";
  return "Invite links: admins can see only invite links created by this admin account.";
}

function CreateMtprotoModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: { phone: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ phone: string }>();
  return (
    <Modal open={open} onClose={onClose} title="Connect Telegram account">
      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          label="Phone"
          required
          error={errors.phone ? "Required field" : undefined}
        >
          <Input
            placeholder="+15551234567"
            {...register("phone", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateBotModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: { botToken: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ botToken: string }>();
  return (
    <Modal open={open} onClose={onClose} title="Connect Telegram bot">
      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          label="Bot token"
          required
          error={errors.botToken ? "Required field" : undefined}
        >
          <Input
            placeholder="123456:ABC..."
            {...register("botToken", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Connect</Button>
        </div>
      </form>
    </Modal>
  );
}

function CodeModal({
  open,
  account,
  onClose,
  onDone,
  onNeedPassword,
  pushToast,
}: {
  open: boolean;
  account: TelegramUserAccount | null;
  onClose: () => void;
  onDone: () => void;
  onNeedPassword: () => void;
  pushToast: (message: string, tone?: ToastItem["tone"]) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ code: string }>();
  const mutation = useMutation({
    mutationFn: (code: string) =>
      telegramUserAccountsApi.confirmCode(String(account?.id), code),
    onSuccess: (response: { status?: string }) => {
      if (response.status === "needs_password") {
        onNeedPassword();
        return;
      }
      pushToast("Account connected.", "success");
      onDone();
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to confirm code."), "error"),
  });
  if (!account) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Enter code: ${account.label}`}>
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => mutation.mutate(values.code))}
      >
        <FormField
          label="Code"
          required
          error={errors.code ? "Required field" : undefined}
        >
          <Input {...register("code", { required: true })} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Confirm</Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({
  open,
  account,
  onClose,
  onDone,
  pushToast,
}: {
  open: boolean;
  account: TelegramUserAccount | null;
  onClose: () => void;
  onDone: () => void;
  pushToast: (message: string, tone?: ToastItem["tone"]) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string }>();
  const mutation = useMutation({
    mutationFn: (password: string) =>
      telegramUserAccountsApi.confirmPassword(String(account?.id), password),
    onSuccess: () => {
      pushToast("Account connected.", "success");
      onDone();
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to confirm password."), "error"),
  });
  if (!account) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`2FA password: ${account.label}`}
    >
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => mutation.mutate(values.password))}
      >
        <FormField
          label="Password"
          required
          error={errors.password ? "Required field" : undefined}
        >
          <Input
            type="password"
            {...register("password", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Confirm</Button>
        </div>
      </form>
    </Modal>
  );
}
