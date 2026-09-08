/**
 * Fleet-membership rules - one deep module, called by every runtime
 * (panel/browser, api-server, telegram-bot) and exercised by table tests.
 *
 * Deletion test: removing this re-implements the same logic at 6 callers
 * (panel normalizeDevice, panel api, server firebases, server bot/index,
 * server fleet/rtdbFleet, panel firebases page) - i.e. its only job is
 * to keep the answers in one place.
 */
export const ONLINE_AFTER_MS = 5 * 60 * 1000;
export const PLACEHOLDER_OWNER = 'OWNER_TELEGRAM_ID_000000000';

export type DevicePrincipal =
  | { kind: 'admin' }
  | { kind: 'owner'; telegramId: string };

export function isUnassignedOwner(
  ownerTelegramId: string | undefined | null
): boolean {
  return !ownerTelegramId || String(ownerTelegramId) === PLACEHOLDER_OWNER;
}

export function isOnline(
  device: { ping?: unknown; lastPing?: unknown; status?: unknown } | null | undefined,
  now: number = Date.now()
): boolean {
  if (!device) return false;
  const t = device.lastPing ?? device.ping;
  if (t != null) {
    const n = Number(t);
    if (!Number.isNaN(n)) return now - n < ONLINE_AFTER_MS;
  }
  const s = device.status;
  if (typeof s === 'boolean') return s;
  if (typeof s === 'string') return s === 'true' || s === 'online';
  return false;
}

export function canSee(
  ownerTelegramId: string | undefined | null,
  principal: DevicePrincipal
): boolean {
  if (principal.kind === 'admin') return true;
  if (isUnassignedOwner(ownerTelegramId)) return true;
  return String(ownerTelegramId) === principal.telegramId;
}
