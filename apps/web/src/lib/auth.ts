export const AUTH_TOKEN_KEY = 'telegram_system_access_token';
export const AUTH_RETURN_TO_KEY = 'telegram_system_auth_return_to';
export const AUTH_TOKEN_CHANGED_EVENT = 'telegram-system-auth-token-changed';
const AUTH_PATHS = new Set(['/login', '/register']);

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
}

export function rememberAuthReturnTo(path?: string): void {
  if (typeof window === 'undefined') return;
  const nextPath = normalizeAuthReturnTo(
    path ?? `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  if (!nextPath) return;
  localStorage.setItem(AUTH_RETURN_TO_KEY, nextPath);
}

export function consumeAuthReturnTo(fallback?: string | null): string {
  const fallbackPath = normalizeAuthReturnTo(fallback);
  if (typeof window === 'undefined') return fallbackPath ?? '/';
  const value = localStorage.getItem(AUTH_RETURN_TO_KEY);
  localStorage.removeItem(AUTH_RETURN_TO_KEY);
  return fallbackPath ?? normalizeAuthReturnTo(value) ?? '/';
}

export function getAuthRedirectPath(path?: string): string {
  const nextPath =
    normalizeAuthReturnTo(
      path ??
        (typeof window === 'undefined'
          ? null
          : `${window.location.pathname}${window.location.search}${window.location.hash}`),
    ) ?? '/';
  return `/login?redirect=${encodeURIComponent(nextPath)}`;
}

export function getAuthRedirectParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('redirect');
}

export function normalizeAuthReturnTo(path?: string | null): string | null {
  if (!path || !path.startsWith('/')) return null;
  if (path.startsWith('//')) return null;
  const pathname = path.split(/[?#]/, 1)[0] || '/';
  if (AUTH_PATHS.has(pathname)) return null;
  return path;
}

export function logout(): void {
  clearAccessToken();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
