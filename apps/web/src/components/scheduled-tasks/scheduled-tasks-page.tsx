"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { History, Pencil, Play, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  LoadingState,
  PageHeader,
  Table,
} from "@/components/ui/primitives";
import {
  scheduledTasksApi,
  type ScheduledTaskSchedule,
  type ScheduledTaskView,
  type UpdateScheduledTaskPayload,
} from "@/lib/api";
import { scheduledTaskKeys } from "@/lib/query-keys";
import { EditTaskModal, HistoryModal } from "./scheduled-task-modals";

export function ScheduledTasksPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ScheduledTaskView | null>(null);
  const [historyTask, setHistoryTask] = useState<ScheduledTaskView | null>(
    null,
  );
  const tasksQuery = useQuery({
    queryKey: scheduledTaskKeys.list(),
    queryFn: scheduledTasksApi.list,
  });
  const historyQuery = useQuery({
    queryKey: historyTask
      ? scheduledTaskKeys.runs(historyTask.key)
      : ["scheduled-tasks", "no-task", "runs"],
    queryFn: () => scheduledTasksApi.runs(historyTask?.key ?? "", 20),
    enabled: Boolean(historyTask),
  });
  const invalidateTask = async (taskKey: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.root }),
      queryClient.invalidateQueries({
        queryKey: scheduledTaskKeys.runs(taskKey),
      }),
    ]);
  };
  const updateMutation = useMutation({
    mutationFn: (params: {
      taskKey: string;
      payload: UpdateScheduledTaskPayload;
    }) => scheduledTasksApi.update(params.taskKey, params.payload),
    onSuccess: (task) => {
      setEditing(null);
      void invalidateTask(task.key);
    },
  });
  const runMutation = useMutation({
    mutationFn: scheduledTasksApi.runNow,
    onSuccess: (run) => {
      void invalidateTask(run.taskKey);
    },
  });
  const tasks = tasksQuery.data?.items ?? [];
  const workspaceTasks = tasks.filter(
    (task) => task.scope === "WORKSPACE_OPERATION",
  );
  const systemTasks = tasks.filter(
    (task) => task.scope === "SYSTEM_MAINTENANCE",
  );

  return (
    <AppShell>
      <PageHeader
        title="Scheduled Tasks"
        subtitle="Workspace automations and protected platform maintenance jobs."
        action={
          <Button
            variant="secondary"
            onClick={() =>
              void queryClient.invalidateQueries({
                queryKey: scheduledTaskKeys.root,
              })
            }
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={16} />
              Refresh
            </span>
          </Button>
        }
      />
      {tasksQuery.isLoading ? (
        <LoadingState text="Loading scheduled tasks" />
      ) : null}
      {tasksQuery.isError ? (
        <div className="rounded-lg border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200">
          Failed to load scheduled tasks.
        </div>
      ) : null}
      {!tasksQuery.isLoading && !tasks.length ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
          No scheduled tasks are available for this workspace.
        </div>
      ) : null}
      {workspaceTasks.length ? (
        <TaskSection
          title="Workspace Operations"
          tasks={workspaceTasks}
          runningTaskKey={runMutation.variables}
          onRun={(task) => runMutation.mutate(task.key)}
          onEdit={setEditing}
          onHistory={setHistoryTask}
        />
      ) : null}
      {systemTasks.length ? (
        <TaskSection
          title="System Maintenance"
          tasks={systemTasks}
          runningTaskKey={runMutation.variables}
          onRun={(task) => runMutation.mutate(task.key)}
          onEdit={setEditing}
          onHistory={setHistoryTask}
        />
      ) : null}
      <EditTaskModal
        task={editing}
        saving={updateMutation.isPending}
        onClose={() => setEditing(null)}
        onSave={(payload) =>
          editing
            ? updateMutation.mutate({ taskKey: editing.key, payload })
            : undefined
        }
      />
      <HistoryModal
        task={historyTask}
        runs={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
        onClose={() => setHistoryTask(null)}
      />
    </AppShell>
  );
}

function TaskSection({
  title,
  tasks,
  runningTaskKey,
  onRun,
  onEdit,
  onHistory,
}: {
  title: string;
  tasks: ScheduledTaskView[];
  runningTaskKey?: string;
  onRun: (task: ScheduledTaskView) => void;
  onEdit: (task: ScheduledTaskView) => void;
  onHistory: (task: ScheduledTaskView) => void;
}) {
  return (
    <section className="mb-6 space-y-3">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/70">
        <Table>
          <thead className="border-b border-neutral-800 bg-neutral-950 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Schedule</th>
              <th className="px-3 py-2">Next</th>
              <th className="px-3 py-2">Last</th>
              <th className="px-3 py-2">Notifications</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {tasks.map((task) => (
              <tr key={task.key} className="align-top">
                <td className="max-w-sm px-3 py-3">
                  <div className="flex items-start gap-2">
                    <StatusDot
                      enabled={task.enabled}
                      status={task.lastRun?.status}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-white">{task.name}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {task.description}
                      </p>
                      {task.lastRun?.error ? (
                        <p className="mt-2 rounded border border-rose-900 bg-rose-950/30 px-2 py-1 text-xs text-rose-200">
                          {task.lastRun.error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-sm text-neutral-300">
                  {formatSchedule(task.schedule)}
                  <p className="text-xs text-neutral-500">
                    {task.schedule.timezone}
                  </p>
                </td>
                <td className="px-3 py-3 text-sm text-neutral-300">
                  {task.nextRunAt ? formatDateTime(task.nextRunAt) : "Disabled"}
                </td>
                <td className="px-3 py-3 text-sm text-neutral-300">
                  {task.lastRun ? (
                    <>
                      <Badge tone={task.lastRun.status}>
                        {task.lastRun.status}
                      </Badge>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatDateTime(task.lastRun.startedAt)}
                        {task.lastRun.durationMs != null
                          ? ` · ${task.lastRun.durationMs} ms`
                          : ""}
                      </p>
                    </>
                  ) : (
                    "Never"
                  )}
                </td>
                <td className="px-3 py-3 text-sm text-neutral-300">
                  {task.notificationState.replace("_", " ")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <IconAction label="History" onClick={() => onHistory(task)}>
                      <History size={15} />
                    </IconAction>
                    {task.canEdit ? (
                      <IconAction label="Edit" onClick={() => onEdit(task)}>
                        <Pencil size={15} />
                      </IconAction>
                    ) : null}
                    {task.canRunNow ? (
                      <IconAction
                        label="Run now"
                        disabled={runningTaskKey === task.key}
                        onClick={() => onRun(task)}
                      >
                        <Play size={15} />
                      </IconAction>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </section>
  );
}

function IconAction({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatusDot({
  enabled,
  status,
}: {
  enabled: boolean;
  status?: string | null;
}) {
  const color = !enabled
    ? "bg-neutral-600"
    : status === "FAILED"
      ? "bg-rose-400"
      : "bg-emerald-400";
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  const cls =
    tone === "FAILED"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : tone === "SUCCESS"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : tone === "SKIPPED"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}

function formatSchedule(schedule: ScheduledTaskSchedule) {
  if (schedule.frequency === "DAILY") return `Daily at ${schedule.time}`;
  return `Every ${schedule.intervalMinutes} min`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
