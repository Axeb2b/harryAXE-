// Attach JWT token as Bearer token on API calls.
const AUTH_KEY = "cyberzone_auth";

export function authHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Support both old sessionId format and new JWT format
      const token = parsed.accessToken || parsed.token || parsed.jwt;
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else if (parsed.telegramId && parsed.sessionId) {
        // Legacy format fallback
        headers["Authorization"] = `Bearer ${parsed.telegramId}:${parsed.sessionId}`;
      }
    }
  } catch {
    /* ignore malformed auth */
  }
  return headers;
}

export function apiFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: authHeaders(init.headers as Record<string, string> | undefined),
  });
}
