import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_MUTATION_EVENT } from "@/lib/api";
import {
  useAppToast,
  useOperationFeedback,
} from "@/providers/toast-provider";
import { renderWithProviders } from "@/test/render-with-providers";

function OperationHarness() {
  const operation = useOperationFeedback();
  const { setProgress } = useAppToast();
  let primaryHandle: ReturnType<typeof operation.start> | null = null;
  let firstHandle: ReturnType<typeof operation.start> | null = null;
  let secondHandle: ReturnType<typeof operation.start> | null = null;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          primaryHandle = operation.start({
            id: "sync:1",
            title: "Sync channel",
            message: "Starting sync…",
          });
        }}
      >
        Start
      </button>
      <button
        type="button"
        onClick={() =>
          primaryHandle?.update({
            message: "Resolving Telegram entity",
            current: 2,
            total: 4,
          })
        }
      >
        Update
      </button>
      <button
        type="button"
        onClick={() =>
          primaryHandle?.succeed({
            message: "Channel sync completed",
            details: "4 synced · 0 failed",
          })
        }
      >
        Succeed
      </button>
      <button
        type="button"
        onClick={() =>
          primaryHandle?.fail({
            message: "Permission denied",
            code: "FORBIDDEN",
            correlationId: "corr-1",
          })
        }
      >
        Fail
      </button>
      <button
        type="button"
        onClick={() => {
          operation.start({
            id: "duplicate",
            title: "Duplicate op",
            message: "Saving once",
          });
          operation.start({
            id: "duplicate",
            title: "Duplicate op",
            message: "Saving once",
          });
        }}
      >
        Duplicate start
      </button>
      <button
        type="button"
        onClick={() => {
          firstHandle = operation.start({
            id: "parallel:1",
            title: "First operation",
            message: "First loading",
          });
          secondHandle = operation.start({
            id: "parallel:2",
            title: "Second operation",
            message: "Second loading",
          });
          firstHandle.succeed({ message: "First done" });
          secondHandle.fail({ message: "Second failed", code: "FAILED" });
        }}
      >
        Parallel
      </button>
      <button
        type="button"
        onClick={() =>
          setProgress({
            id: "progress-1",
            title: "Sync channel",
            current: 2,
            total: 4,
            message: "Resolving Telegram entity",
          })
        }
      >
        Legacy progress
      </button>
      <button
        type="button"
        onClick={() =>
          setProgress({
            id: "progress-mixed",
            title: "Sync channel",
            current: 9,
            total: 9,
            message: "Channel sync completed",
            completed: true,
            successCount: 8,
            failedCount: 1,
            skippedCount: 0,
          })
        }
      >
        Legacy mixed complete
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start creates one loading toast", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Starting sync…")).toBeInTheDocument();
    expect(screen.getByText("Sync channel")).toBeInTheDocument();
  });

  it("update changes the same toast", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    expect(await screen.findByText("Resolving Telegram entity")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.queryByText("Starting sync…")).not.toBeInTheDocument();
  });

  it("succeed transforms the same toast without creating a second one", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Succeed" }));

    expect(await screen.findByText("Channel sync completed")).toBeInTheDocument();
    expect(screen.getAllByText("Channel sync completed")).toHaveLength(1);
    expect(screen.queryByText("Starting sync…")).not.toBeInTheDocument();
  });

  it("fail transforms the same toast", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Fail" }));

    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
    expect(
      screen.getByText(/Code: FORBIDDEN[\s\S]*Correlation ID: corr-1/),
    ).toBeInTheDocument();
  });

  it("two parallel operations do not mix", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Parallel" }));

    expect(await screen.findByText("First done")).toBeInTheDocument();
    expect(screen.getByText("Second failed")).toBeInTheDocument();
    expect(screen.getByText("Code: FAILED")).toBeInTheDocument();
  });

  it("repeated start with the same ID does not create a duplicate", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Duplicate start" }));

    expect(await screen.findByText("Saving once")).toBeInTheDocument();
    expect(screen.getAllByText("Saving once")).toHaveLength(1);
  });

  it("auto-dismisses success", async () => {
    vi.useFakeTimers();
    renderWithProviders(<OperationHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      fireEvent.click(screen.getByRole("button", { name: "Succeed" }));
    });
    expect(screen.getByText("Channel sync completed")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.queryByText("Channel sync completed")).not.toBeInTheDocument();
  });

  it("keeps error visible longer", () => {
    vi.useFakeTimers();
    renderWithProviders(<OperationHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      fireEvent.click(screen.getByRole("button", { name: "Fail" }));
    });
    expect(screen.getByText("Permission denied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.getByText("Permission denied")).toBeInTheDocument();
  });

  it("manual close clears the dismiss timer", () => {
    vi.useFakeTimers();
    renderWithProviders(<OperationHarness />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      fireEvent.click(screen.getByRole("button", { name: "Succeed" }));
    });
    expect(screen.getByText("Channel sync completed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText("Channel sync completed")).not.toBeInTheDocument();
  });

  it("managed mutation events do not create automatic toasts", () => {
    renderWithProviders(<OperationHarness />);

    window.dispatchEvent(
      new CustomEvent(API_MUTATION_EVENT, {
        detail: {
          id: "managed-1",
          phase: "start",
          mode: "managed",
          message: "Managed loading",
        },
      }),
    );

    expect(screen.queryByText("Managed loading")).not.toBeInTheDocument();
  });

  it("still supports legacy progress bridges through the global provider", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Legacy progress" }));

    expect(await screen.findByText("Resolving Telegram entity")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("keeps completed mixed progress as informational instead of success", async () => {
    renderWithProviders(<OperationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Legacy mixed complete" }));

    expect(await screen.findByText("Channel sync completed")).toBeInTheDocument();
    expect(screen.getByText("8 success · 1 failed · 0 skipped")).toBeInTheDocument();
  });
});
