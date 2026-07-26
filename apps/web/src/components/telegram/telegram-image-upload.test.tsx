import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramImageUpload } from "@/components/telegram/telegram-image-upload";

const pushToast = vi.fn();
const uploadMock = vi.fn();

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    pushToast,
  }),
}));

vi.mock("@/lib/api", () => ({
  iconsApi: {
    upload: (...args: unknown[]) => uploadMock(...args),
  },
}));

describe("TelegramImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("uploads an image pasted from the clipboard", async () => {
    uploadMock.mockResolvedValueOnce({ imageUrl: "https://cdn.test/pasted.png" });
    const onChange = vi.fn();

    render(<TelegramImageUpload value={[]} onChange={onChange} />);

    const pasteTarget = screen.getByText(
      "Upload images, paste with Ctrl/Cmd+V, or load by image URL",
    ).closest("div[tabindex]");
    expect(pasteTarget).toBeTruthy();

    const file = new File(["image"], "pasted.png", { type: "image/png" });
    fireEvent.paste(pasteTarget as HTMLElement, {
      clipboardData: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith(file);
    });
    expect(onChange).toHaveBeenCalledWith(["https://cdn.test/pasted.png"]);
  });

  it("loads an image by URL and uploads it", async () => {
    uploadMock.mockResolvedValueOnce({ imageUrl: "https://cdn.test/remote.png" });
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TelegramImageUpload value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.png"), {
      target: { value: "https://example.com/remote.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add by url/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/remote.png");
    });
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    expect(onChange).toHaveBeenCalledWith(["https://cdn.test/remote.png"]);
  });
});
