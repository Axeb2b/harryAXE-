/**
 * Firebase Realtime Database REST access.
 *
 * AUTHENTICATED MODE (recommended, pairs with firebase-rules.draft.json):
 * Provide a service-account JSON for the database project via either
 *   - FIREBASE_SERVICE_ACCOUNT            (the JSON document as a string), or
 *   - GOOGLE_APPLICATION_CREDENTIALS      (path to the JSON file)
 * When present, every RTDB call carries a Google OAuth2 access token
 * (signed locally with the service-account key, auto-refreshed), so requests
 * are authenticated and RTDB security rules are enforced.
 *
 * Without credentials the legacy unauthenticated REST path is used, which
 * requires open rules (the current state until creds are configured).
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";

const DB_URL =
  process.env["FIREBASE_DB_URL"] ||
  "https://axexodiweb-default-rtdb.firebaseio.com";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES =
  "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email";

let saCache: { clientEmail: string; privateKey: string } | null | undefined;
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenFailAt = 0; // backoff after a failed token exchange

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccount(): {
  clientEmail: string;
  privateKey: string;
} | null {
  if (saCache !== undefined) return saCache;
  try {
    const inline = process.env["FIREBASE_SERVICE_ACCOUNT"];
    const jsonStr =
      inline ??
      (process.env["GOOGLE_APPLICATION_CREDENTIALS"]
        ? fs.readFileSync(
            process.env["GOOGLE_APPLICATION_CREDENTIALS"],
            "utf-8"
          )
        : "");
    if (!jsonStr) {
      saCache = null;
      return null;
    }
    const parsed = JSON.parse(jsonStr);
    if (!parsed.client_email || !parsed.private_key) {
      console.error(
        "[firebase] Service account missing client_email/private_key"
      );
      saCache = null;
      return null;
    }
    saCache = {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
    console.log("[firebase] Authenticated mode active (service account)");
    return saCache;
  } catch (err) {
    console.error(
      "[firebase] Failed to load service account, using unauthenticated REST:",
      err
    );
    saCache = null;
    return null;
  }
}

export async function fetchAccessToken(): Promise<string | null> {
  const sa = loadServiceAccount();
  if (!sa) return null;
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000)
    return tokenCache.token;
  if (Date.now() < tokenFailAt) return null; // don't hammer the token endpoint after a failure
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: sa.clientEmail,
        scope: SCOPES,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      })
    );
    const signingInput = `${header}.${claims}`;
    const signature = base64url(
      crypto.sign("RSA-SHA256", Buffer.from(signingInput), sa.privateKey)
    );
    const assertion = `${signingInput}.${signature}`;
    const res = await fetch(TOKEN_URL, {
      signal: AbortSignal.timeout(15_000),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      console.error(`[firebase] Token exchange failed: ${res.status}`);
      tokenFailAt = Date.now() + 60_000;
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    return data.access_token;
  } catch (err) {
    console.error("[firebase] Token fetch error:", err);
    tokenFailAt = Date.now() + 60_000;
    return null;
  }
}

// RTDB accepts OAuth2 access tokens via the Authorization: Bearer header
// (the `?access_token=` query param is not honored by Realtime Database).
async function fbFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await fetchAccessToken();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${DB_URL}/${path}.json`, { ...init, headers });
}

export async function fbGet(path: string): Promise<any> {
  const res = await fbFetch(path, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    // Rules-denied reads return null (treated as "no data") instead of crashing
    // the caller — this keeps login/verify/overview working under locked rules.
    if (res.status === 401 || res.status === 403) return null;
    throw new Error(`Firebase GET failed: ${res.status}`);
  }
  return res.json();
}

export async function fbSet(path: string, data: any): Promise<void> {
  const res = await fbFetch(path, {
    signal: AbortSignal.timeout(15_000),
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase SET failed: ${res.status}`);
}

export async function fbUpdate(path: string, data: any): Promise<void> {
  const res = await fbFetch(path, {
    signal: AbortSignal.timeout(15_000),
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Firebase PATCH failed: ${res.status}`);
}

export async function fbDelete(path: string): Promise<void> {
  const res = await fbFetch(path, {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Firebase DELETE failed: ${res.status}`);
}

// Subscription helpers
export interface Subscription {
  telegramId: string;
  username: string;
  plan: string;
  status: "active" | "expired";
  expiresAt: number;
  createdAt: number;
}

export async function getSubscription(
  telegramId: string
): Promise<Subscription | null> {
  const data = await fbGet(`subscriptions/${telegramId}`);
  return data || null;
}

export async function getAllSubscriptions(): Promise<
  Record<string, Subscription>
> {
  const data = await fbGet("subscriptions");
  return data || {};
}

export async function setSubscription(
  telegramId: string,
  sub: Partial<Subscription>
): Promise<void> {
  await fbUpdate(`subscriptions/${telegramId}`, sub);
}

export async function deleteSubscription(telegramId: string): Promise<void> {
  await fbDelete(`subscriptions/${telegramId}`);
}

export async function isSubscriptionActive(
  telegramId: string
): Promise<boolean> {
  const sub = await getSubscription(telegramId);
  if (!sub) return false;
  if (sub.status !== "active") return false;
  if (sub.expiresAt && Date.now() > sub.expiresAt) {
    // Auto-expire
    await fbUpdate(`subscriptions/${telegramId}`, { status: "expired" });
    return false;
  }
  return true;
}

// Get all clients
export async function getAllClients(): Promise<Record<string, any>> {
  const data = await fbGet("clients");
  return data || {};
}

// ─── OTP helpers ────────────────────────────────────────────────────────────

export async function setOtp(telegramId: string, code: string): Promise<void> {
  await fbSet(`otps/${telegramId}`, {
    code,
    expiry: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
}

export async function verifyAndDeleteOtp(
  telegramId: string,
  code: string
): Promise<boolean> {
  const data = await fbGet(`otps/${telegramId}`);
  if (!data) return false;
  if (data.expiry < Date.now()) {
    await fbDelete(`otps/${telegramId}`);
    return false;
  }
  if (data.code.toString().trim() !== code.toString().trim()) return false;
  await fbDelete(`otps/${telegramId}`);
  return true;
}

// ─── Panel auth helpers ──────────────────────────────────────────────────────

/** Find a panel user by email — checks admin config first, then subscriptions */
export async function findUserByEmail(
  email: string
): Promise<{ telegramId: string; data: any; isAdmin: boolean } | null> {
  const normalEmail = email.toLowerCase().trim();

  // Check admin config
  const admin = await fbGet("config/admin");
  if (admin?.email?.toLowerCase() === normalEmail) {
    return {
      telegramId: admin.telegramId || "5064888403",
      data: admin,
      isAdmin: true,
    };
  }

  // Check subscriptions
  const subs = await getAllSubscriptions();
  for (const [telegramId, sub] of Object.entries(subs)) {
    if ((sub as any).email?.toLowerCase() === normalEmail) {
      return { telegramId, data: sub, isAdmin: false };
    }
  }

  return null;
}

/** Set panel password for a user (subscription or admin) */
export async function setPanelPassword(
  telegramId: string,
  password: string,
  isAdmin = false
): Promise<void> {
  if (isAdmin) {
    await fbUpdate("config/admin", { panelPassword: password });
  } else {
    await fbUpdate(`subscriptions/${telegramId}`, { panelPassword: password });
  }
}

/** Set admin email (first-time setup) */
export async function setAdminConfig(config: {
  telegramId: string;
  email?: string;
  username?: string;
  panelPassword?: string;
}): Promise<void> {
  const existing = (await fbGet("config/admin")) || {};
  await fbSet("config/admin", { ...existing, ...config });
}

// ─── SMS Channel helpers ─────────────────────────────────────────────────────

/** Get configured SMS forwarding channel ID */
export async function getSmsChannel(): Promise<string | null> {
  const data = await fbGet("config/smsChannel");
  return data?.channelId || null;
}

/** Set SMS forwarding channel ID */
export async function setSmsChannel(channelId: string): Promise<void> {
  await fbSet("config/smsChannel", { channelId });
}

/** Remove SMS forwarding channel */
export async function removeSmsChannel(): Promise<void> {
  await fbDelete("config/smsChannel");
}

// ─── SMS forward watermarks ──────────────────────────────────────────────────

/** Get last forwarded SMS timestamp per device */
export async function getSmsWatermarks(): Promise<Record<string, number>> {
  const data = await fbGet("config/smsWatermarks");
  return data || {};
}

/** Update watermark for a single device */
export async function setSmsWatermark(
  deviceId: string,
  timestamp: number
): Promise<void> {
  await fbUpdate("config/smsWatermarks", { [deviceId]: timestamp });
}

/** CC capture watermarks — stores last-seen cc_timestamp per device */
export async function getCcWatermarks(): Promise<Record<string, string>> {
  const data = await fbGet("config/ccWatermarks");
  return data || {};
}

export async function setCcWatermark(
  deviceId: string,
  timestamp: string
): Promise<void> {
  await fbUpdate("config/ccWatermarks", { [deviceId]: timestamp });
}
