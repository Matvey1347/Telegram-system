import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { renderWithProviders } from "@/test/render-with-providers";
import { createNavigationMocks } from "@/test/router-mocks";

const navigationMocks = createNavigationMocks();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => navigationMocks,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

const { usePathname } = await import("next/navigation");

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the registration page without redirecting guests to login", async () => {
    vi.mocked(usePathname).mockReturnValue("/register");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Register page</div>
      </ProtectedRoute>,
    );

    expect(await screen.findByText("Register page")).toBeInTheDocument();
    await waitFor(() => {
      expect(navigationMocks.replace).not.toHaveBeenCalled();
    });
  });

  it("redirects guests from protected pages to login", async () => {
    vi.mocked(usePathname).mockReturnValue("/settings");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Settings page</div>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fsettings");
    });
  });
});
