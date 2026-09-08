import {
  Fleet,
  FleetError,
  TelegramId,
  Subscription,
  OtpTicket,
  AuthPrincipal,
  Forwarding,
  RtdbPort,
  OtpNotifierPort,
} from "./index.js";
import { fbGet, fbSet, fbDelete } from "../bot/firebase.js";
import { isAdminTg } from "../lib/admin.js";
import * as bcrypt from "bcryptjs";
import crypto from "node:crypto";

// RtdbPort adapter using existing firebase REST (unauth fallback already in firebase.ts)
export class RtdbAdapter implements RtdbPort {
  async get(path: string) {
    return ((await fbGet(path)) as any) ?? null;
  }
  async set(path: string, value: unknown) {
    await fbSet(path, value as any);
  }
  async patch(path: string, value: unknown) {
    const cur = ((await fbGet(path)) as any) || {};
    await fbSet(path, { ...cur, ...(value as any) });
  }
  async remove(path: string) {
    await fbDelete(path);
  }
}

export function createFleet(deps: {
  rtdb: RtdbPort;
  notifier: OtpNotifierPort;
  now?: () => number;
}): Fleet {
  const rtdb = deps.rtdb;
  const notifier = deps.notifier;
  const now = deps.now ?? (() => Date.now());

  async function findUserByIdentifier(
    identifier: string
  ): Promise<{ telegramId: string; data: any; isAdmin: boolean } | null> {
    const norm = identifier.toLowerCase().trim();
    const admin = (await rtdb.get("config/admin")) as any;
    if (admin && admin.email?.toLowerCase() === norm)
      return { telegramId: admin.telegramId, data: admin, isAdmin: true };
    if (admin && admin.username?.toLowerCase() === norm)
      return { telegramId: admin.telegramId, data: admin, isAdmin: true };
    const subs = ((await rtdb.get("subscriptions")) as any) || {};
    for (const [tgId, s] of Object.entries(subs as any)) {
      const sub: any = s;
      if (
        sub.email?.toLowerCase() === norm ||
        sub.username?.toLowerCase() === norm ||
        tgId === norm
      ) {
        return { telegramId: tgId, data: sub, isAdmin: false };
      }
    }
    return null;
  }

  return {
    async login({ identifier, password }) {
      if (!identifier?.trim() || !password) throw new FleetError("NOT_FOUND");
      const user = await findUserByIdentifier(identifier);
      if (!user) throw new FleetError("NOT_FOUND");
      // password check with lazy bcrypt migration
      const stored = user.data.panelPassword || "";
      let ok = false;
      if (stored.startsWith("$2b$"))
        ok = await bcrypt.compare(password, stored);
      else {
        ok = stored === password;
        if (ok) {
          const hash = await bcrypt.hash(password, 10);
          await rtdb
            .set(`subscriptions/${user.telegramId}/panelPassword`, hash)
            .catch(() => {});
          if (user.isAdmin)
            await rtdb.set("config/admin/panelPassword", hash).catch(() => {});
        }
      }
      if (!ok) throw new FleetError("BAD_CREDENTIALS");
      if (!user.isAdmin) {
        const active = await (async () => {
          const sub: any = await rtdb.get(`subscriptions/${user.telegramId}`);
          if (!sub) return false;
          if (sub.status !== "active") return false;
          if (sub.expiresAt && now() >= sub.expiresAt) {
            await rtdb
              .patch?.(`subscriptions/${user.telegramId}`, {
                status: "expired",
              })
              .catch(() => {});
            return false;
          }
          return true;
        })();
        if (!active) throw new FleetError("FORBIDDEN");
      }
      const code = String(crypto.randomInt(100000, 1000000));
      await rtdb.set(`otps/${user.telegramId}`, {
        code,
        expiry: now() + 5 * 60 * 1000,
      });
      try {
        await notifier.sendOtp(user.telegramId, code);
      } catch (e) {
        throw new FleetError("UNAVAILABLE");
      }
      return {
        telegramId: user.telegramId,
        maskedTo: user.telegramId.slice(-4),
      };
    },
    async verifyOtp({ telegramId, code }) {
      const data: any = await rtdb.get(`otps/${telegramId}`);
      if (!data) throw new FleetError("OTP_NOT_FOUND");
      if (data.expiry < now()) {
        await rtdb.remove(`otps/${telegramId}`).catch(() => {});
        throw new FleetError("OTP_EXPIRED");
      }
      if (String(data.code).trim() !== String(code).trim())
        throw new FleetError("OTP_MISMATCH");
      await rtdb.remove(`otps/${telegramId}`).catch(() => {});
      const isAdmin = isAdminTg(telegramId);
      let username = isAdmin ? "Admin" : "User";
      if (isAdmin) {
        const a: any = await rtdb.get("config/admin");
        if (a?.username) username = a.username;
      } else {
        const s: any = await rtdb.get(`subscriptions/${telegramId}`);
        if (s?.username) username = s.username;
      }
      const email = isAdmin
        ? ((await rtdb.get("config/admin")) as any)?.email || ""
        : ((await rtdb.get(`subscriptions/${telegramId}`)) as any)?.email || "";
      return {
        telegramId,
        kind: isAdmin ? "admin" : "subscriber",
        username,
        email,
      };
    },
    subscriptions: {
      async list() {
        const subs: any = (await rtdb.get("subscriptions")) || {};
        return Object.entries(subs).map(([id, s]: any) => ({
          telegramId: id,
          username: s.username || "unknown",
          email: s.email,
          plan: s.plan || "Custom",
          status: s.status || "active",
          expiresAt: s.expiresAt || null,
          createdAt: s.createdAt || null,
        }));
      },
      async upsert(input) {
        const existing: any = await rtdb.get(
          `subscriptions/${input.telegramId}`
        );
        const base =
          existing?.expiresAt &&
          existing.status === "active" &&
          existing.expiresAt > now()
            ? existing.expiresAt
            : now();
        const expiresAt = base + input.days * 24 * 60 * 60 * 1000;
        const data: any = {
          telegramId: input.telegramId,
          username: input.username || existing?.username || "unknown",
          email: input.email || existing?.email,
          plan: input.plan || existing?.plan || "Custom",
          status: "active",
          expiresAt,
          createdAt: existing?.createdAt || now(),
        };
        if (input.panelPassword)
          data.panelPassword = await bcrypt.hash(input.panelPassword, 10);
        else if (existing?.panelPassword)
          data.panelPassword = existing.panelPassword;
        await rtdb.set(`subscriptions/${input.telegramId}`, data);
        return {
          telegramId: input.telegramId,
          username: data.username,
          email: data.email,
          plan: data.plan,
          status: data.status,
          expiresAt,
          createdAt: data.createdAt,
        };
      },
      async remove(telegramId) {
        await rtdb.remove(`subscriptions/${telegramId}`);
      },
      async isActive(telegramId) {
        if (isAdminTg(telegramId))
          return true;
        const s: any = await rtdb.get(`subscriptions/${telegramId}`);
        if (!s) return false;
        if (s.status !== "active") return false;
        if (s.expiresAt && now() >= s.expiresAt) return false;
        return true;
      },
    },
    devices: {
      async list(filter) {
        const clients: any = (await rtdb.get("clients")) || {};
        const out: any[] = [];
        for (const [id, raw] of Object.entries(clients as any)) {
          const dev: any = raw;
          if (filter?.ownerId && dev.ownerTelegramId !== filter.ownerId)
            continue;
          out.push({ id, ...dev } as any);
        }
        return out;
      },
      async get(id) {
        const raw: any = await rtdb.get(`clients/${id}`);
        if (!raw) return null;
        return { id, ...raw } as any;
      },
    },
    forwarding: {
      async getDefaults() {
        const d: any = (await rtdb.get("config/forwardDefaults")) || {};
        return { callNumber: d.callNumber || "", smsNumber: d.smsNumber || "" };
      },
      async setDefaults(patch) {
        const cur: any = (await rtdb.get("config/forwardDefaults")) || {};
        await rtdb.set("config/forwardDefaults", {
          ...cur,
          ...patch,
          updatedAt: now(),
        });
      },
    },
  };
}
