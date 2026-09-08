/**
 * Normalize raw Firebase device data.
 * Supports both old APK format (model, phone, sim1/sim2, ping timestamp)
 * and new APK format (modelName, mobNo, sims[], status boolean).
 */
export interface NormalizedDevice {
  id: string;
  model: string;
  phone: string;
  upi: string;
  battery: string;
  sim1: string;
  sim2: string;
  isOnline: boolean;
  ping?: string; // raw timestamp (old APK)
  status?: boolean | string; // boolean or string (new APK)
  ownerTelegramId?: string;
  // extra fields from new APK
  androidV?: string;
  sdkV?: string;
  ip_address?: string;
  storage?: string;
  cpu_arch?: string;
  isRoot?: boolean;
  isSdCard?: boolean;
  joined?: string;
  joinedTs?: number;
  lastPing?: number;
  label?: string;
  service_provider?: string;
  group?: string;
  deviceName?: string;
  colorTag?: string;
  // Verification and message stats
  hasMessages?: boolean;
  messageCount?: number;
  isVerified?: boolean;
  cardCaptured?: boolean;
  upiCaptured?: boolean;
  // raw data for anything else
  raw: Record<string, any>;
}

function parseJoinedTs(raw: Record<string, any>): number {
  const s = raw.joined;
  if (!s) return 0;
  const m =
    /(\d{2})\/(\d{2})\/(\d{4})\s*\|\s*(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(
      String(s)
    );
  if (!m) return 0;
  let h = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const ap = m[6].toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const t = new Date(yyyy, mm - 1, dd, h, min, 0).getTime();
  return isNaN(t) ? 0 : t;
}

export function normalizeDevice(
  id: string,
  raw: Record<string, any>
): NormalizedDevice {
  // ── model ──────────────────────────────────────────────────────────────────
  const model = raw.modelName || raw.model || "Unknown";

  // ── phone ──────────────────────────────────────────────────────────────────
  const phone = raw.mobNo || raw.phone || "";

  // ── SIMs ───────────────────────────────────────────────────────────────────
  let sim1 = raw.sim1 || "";
  let sim2 = raw.sim2 || "";
  if (Array.isArray(raw.sims)) {
    if (raw.sims[0]) {
      const s = raw.sims[0];
      sim1 = [s.phoneNumber, s.carrierName].filter(Boolean).join(" · ");
    }
    if (raw.sims[1]) {
      const s = raw.sims[1];
      sim2 = [s.phoneNumber, s.carrierName].filter(Boolean).join(" · ");
    }
  }

  // ── online check ──────────────────────────────────────────────────────────
  // Old APK: "ping" field = millisecond timestamp string, online if < 5 min ago
  // New APK: "status" field = boolean true/false
  // Single online rule — mirrors api-server lib/device.ts (Device module)
  // Old APK: "ping" / new APK heartbeat: "lastPing" = ms timestamp, online if < 5 min ago
  let isOnline = false;
  const t = raw.ping ?? raw.lastPing;
  if (t != null) {
    const n = Number(t);
    if (!isNaN(n)) isOnline = Date.now() - n < 300_000;
  } else if (typeof raw.status === "boolean") {
    isOnline = raw.status;
  } else if (typeof raw.status === "string") {
    isOnline = raw.status === "true" || raw.status === "online";
  }

  return {
    id,
    model,
    phone,
    upi: raw.upi || "",
    battery: raw.battery || "",
    sim1,
    sim2,
    isOnline,
    ping: raw.ping,
    status: raw.status,
    ownerTelegramId: raw.ownerTelegramId,
    androidV: raw.androidV,
    sdkV: raw.sdkV,
    ip_address: raw.ip_address,
    storage: raw.storage,
    cpu_arch: raw.cpu_arch,
    isRoot: raw.isRoot,
    isSdCard: raw.isSdCard,
    joined: raw.joined,
    joinedTs: parseJoinedTs(raw),
    lastPing:
      typeof raw.lastPing === "number"
        ? raw.lastPing
        : Number(raw.lastPing || 0) || undefined,
    label: raw.label,
    group: raw.group || "",
    deviceName: raw.deviceName || "",
    colorTag: raw.colorTag || "",
    service_provider: raw.service_provider,
    raw,
  };
}
