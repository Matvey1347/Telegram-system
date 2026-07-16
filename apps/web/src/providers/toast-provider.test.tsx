import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppToast } from "@/providers/toast-provider";
import { API_MUTATION_EVENT } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";

function ToastHarness() {
  const { pushToast, setProgress } = useAppToast();

  return (
    <div>
      <button
        type="button"
        onClick={() => pushToast("Channel updated", "success")}
      >
        Push toast
      </button>
      <button
        type="button"
        onClick={() =>
          setProgress({
            id: "sync-1",
            title: "Sync channel",
            current: 2,
            total: 4,
            message: "Resolving Telegram entity",
          })
        }
      >
        Set progress
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("renders manual success toasts for visible operation feedback", async () => {
    renderWithProviders(<ToastHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Push toast" }));

    expect(await screen.findByText("Channel updated")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("renders mutation and progress feedback from shared global layers", async () => {
    renderWithProviders(<ToastHarness />);

    window.dispatchEvent(
      new CustomEvent(API_MUTATION_EVENT, {
        detail: {
          id: "mutation-1",
          phase: "start",
        },
      }),
    );

    expect(await screen.findByText("Waiting for the server…")).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent(API_MUTATION_EVENT, {
        detail: {
          id: "mutation-1",
          phase: "success",
          message: "Created successfully.",
        },
      }),
    );

    expect(await screen.findByText("Created successfully.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Set progress" }));

    expect(await screen.findByText("Resolving Telegram entity")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });
});
