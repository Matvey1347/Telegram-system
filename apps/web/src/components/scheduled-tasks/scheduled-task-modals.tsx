"use client";

import { useMemo, useState } from "react";
import {
  Button,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
} from "@/components/ui/primitives";
import type {
  ScheduledTaskRunSummary,
  ScheduledTaskSchedule,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from "@/lib/api";

const TIMEZONES = [
  "Europe/Warsaw",
  "Europe/Kyiv",
  "UTC",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];

export function EditTaskModal({
  task,
  saving,
  onClose,
  onSave,
}: {
  task: ScheduledTaskView | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: UpdateScheduledTaskPayload) => void;
}) {
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title={task?.name ?? "Edit task"}
    >
      {task ? (
        <EditTaskForm
          key={task.key}
          task={task}
          saving={saving}
          onClose={onClose}
          onSave={onSave}
        />
      ) : null}
    </Modal>
  );
}

function EditTaskForm({
  task,
  saving,
  onClose,
  onSave,
}: {
  task: ScheduledTaskView;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: UpdateScheduledTaskPayload) => void;
}) {
  const [enabled, setEnabled] = useState(task.enabled);
  const [schedule, setSchedule] = useState<ScheduledTaskSchedule>(
    task.schedule,
  );
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(
    task.notifications.notifyOnSuccess,
  );
  const [notifyOnFailure, setNotifyOnFailure] = useState(
    task.notifications.notifyOnFailure,
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          enabled,
          schedule,
          notifications: {
            notifyOnSuccess,
            notifyOnFailure,
            channel: "SYSTEM_TELEGRAM_BOT",
          },
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Enabled
      </label>
      <FormField label="Frequency">
        <Select
          value={schedule.frequency}
          onChange={(event) => {
            const frequency = event.target
              .value as ScheduledTaskSchedule["frequency"];
            setSchedule(
              frequency === "DAILY"
                ? { frequency, time: "00:00", timezone: schedule.timezone }
                : {
                    frequency,
                    intervalMinutes: 30,
                    timezone: schedule.timezone,
                  },
            );
          }}
        >
          {task.supportedFrequencies.map((frequency) => (
            <option key={frequency} value={frequency}>
              {frequency}
            </option>
          ))}
        </Select>
      </FormField>
      {schedule.frequency === "DAILY" ? (
        <FormField label="Time">
          <Input
            type="time"
            value={schedule.time}
            onChange={(event) =>
              setSchedule({ ...schedule, time: event.target.value })
            }
          />
        </FormField>
      ) : (
        <FormField label="Interval minutes">
          <Input
            type="number"
            min={1}
            max={1440}
            value={schedule.intervalMinutes}
            onChange={(event) =>
              setSchedule({
                ...schedule,
                intervalMinutes: Number(event.target.value || 1),
              })
            }
          />
        </FormField>
      )}
      <FormField label="Timezone">
        <Select
          value={schedule.timezone}
          onChange={(event) =>
            setSchedule({ ...schedule, timezone: event.target.value })
          }
        >
          {TIMEZONES.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={notifyOnSuccess}
            onChange={(event) => setNotifyOnSuccess(event.target.checked)}
          />
          Notify on success
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={notifyOnFailure}
            onChange={(event) => setNotifyOnFailure(event.target.checked)}
          />
          Notify on failure
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function HistoryModal({
  task,
  runs,
  loading,
  onClose,
}: {
  task: ScheduledTaskView | null;
  runs: ScheduledTaskRunSummary[];
  loading: boolean;
  onClose: () => void;
}) {
  const compactRuns = useMemo(() => runs.filter(Boolean), [runs]);
  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      title={`${task?.name ?? "Task"} history`}
    >
      {loading ? <LoadingState text="Loading task history" /> : null}
      {!loading && !compactRuns.length ? (
        <p className="text-sm text-neutral-400">No runs recorded yet.</p>
      ) : null}
      <div className="space-y-2">
        {compactRuns.map((run) => (
          <div
            key={run.id}
            className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RunBadge status={run.status} />
              <span className="text-xs text-neutral-500">
                {run.trigger} · {new Date(run.startedAt).toLocaleString()}
              </span>
            </div>
            {run.resultSummary ? (
              <p className="mt-2 text-neutral-300">{run.resultSummary}</p>
            ) : null}
            {run.error ? (
              <p className="mt-2 text-rose-200">{run.error}</p>
            ) : null}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function RunBadge({ status }: { status: string }) {
  const cls =
    status === "FAILED"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : status === "SUCCESS"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : status === "SKIPPED"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${cls}`}>
      {status}
    </span>
  );
}
