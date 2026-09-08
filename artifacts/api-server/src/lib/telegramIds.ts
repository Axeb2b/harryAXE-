/**
 * Telegram ID sanity — single definition, used by every owner-DM path.
 *
 * Devices built from stale APK templates bake in the literal template
 * placeholder "OWNER_TELEGRAM_ID_000000000" (underscores included). That
 * value used to flow back from Firebase into sendMessage() calls:
 *   - DM to it → Telegram "400: Bad Request: chat not found" (spam + retries)
 *   - embedded unescaped in admin mirror text → underscores opened an italic
 *     entity that never closed → "400: Bad Request: can't parse entities"
 *
 * Rule: a DM-able owner id is digits only (no sign, no underscores, no
 * placeholders). Anything else = device is unbound (null).
 */
const OWNER_ID_RE = /^\d{5,20}$/;

export function sanitizeOwnerTelegramId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return OWNER_ID_RE.test(s) ? s : null;
}

/** Same rule, boolean form for guards that only need a yes/no. */
export function isValidTelegramId(v: unknown): boolean {
  return sanitizeOwnerTelegramId(v) !== null;
}
