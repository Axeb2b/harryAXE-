import { Router } from "express";
import {
  getAllSubscriptions,
  getSubscription,
  setSubscription,
  deleteSubscription,
} from "../bot/firebase";
import { sendSubscriptionNotification } from "../bot/index";
import { getPlan, planFeatureLabel } from "../lib/plans";
import { requireAdmin } from "../middlewares/auth";
import { createFleet, RtdbAdapter } from "../fleet/rtdbFleet";
import { getBot } from "../bot/index";

const router = Router();

function getFleet() {
  return createFleet({
    rtdb: new RtdbAdapter(),
    notifier: { async sendOtp() {} },
  });
}

function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

function formatDate(ts: number): string {
  return (
    new Date(ts).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " IST"
  );
}

// GET /api/subscriptions — list all
router.get("/subscriptions", requireAdmin, async (_req, res) => {
  try {
    const fleet = getFleet();
    const subs = await fleet.subscriptions.list();
    const now = Date.now();
    const result = subs.map((s: any) => ({
      telegramId: s.telegramId,
      username: s.username || "unknown",
      plan: s.plan || "Custom",
      status:
        s.status === "active" && (!s.expiresAt || now < s.expiresAt)
          ? "active"
          : "expired",
      expiresAt: s.expiresAt || null,
      createdAt: s.createdAt || null,
      daysLeft: s.expiresAt
        ? Math.max(0, Math.floor((s.expiresAt - now) / (1000 * 60 * 60 * 24)))
        : null,
      planMeta: (() => {
        const pl = getPlan(s.plan);
        return {
          id: pl.id,
          name: pl.name,
          features: pl.features,
          featureLabels: planFeatureLabel(pl.features),
        };
      })(),
    }));
    return res.json({ subscriptions: result });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

// POST /api/subscriptions — add/extend
router.post("/subscriptions", requireAdmin, async (req, res) => {
  try {
    const { telegramId, username, days, plan, email, panelPassword } =
      req.body ?? {};

    if (!telegramId || !days) {
      return res
        .status(400)
        .json({ error: "telegramId and days are required" });
    }

    const daysNum = parseInt(days);
    if (isNaN(daysNum) || daysNum <= 0) {
      return res.status(400).json({ error: "days must be a positive number" });
    }

    // Fleet: single call hides expiry + bcrypt + isActive
    const fleet = getFleet();
    const sub = await fleet.subscriptions.upsert({
      telegramId: String(telegramId),
      days: daysNum,
      username: username as string | undefined,
      email: email as string | undefined,
      panelPassword: panelPassword as string | undefined,
      plan: plan as string | undefined,
    });
    const expiresAt = sub.expiresAt!;

    // Send Telegram notification to user (queues if user hasn't started bot)
    await sendSubscriptionNotification(telegramId, {
      username: username || "unknown",
      plan: plan || `${daysNum} Days`,
      status: "active",
      expiresAt,
      email: email?.toLowerCase(),
    });

    return res.json({ success: true, telegramId, expiresAt });
  } catch (err) {
    return res.status(500).json({ error: "Failed to add subscription" });
  }
});

// DELETE /api/subscriptions/:id — remove
router.delete("/subscriptions/:id", requireAdmin, async (req, res) => {
  try {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : String(req.params.id);
    const fleet2 = getFleet();
    // Fleet remove is idempotent; check existence via list for 404 parity
    const all = await fleet2.subscriptions.list();
    if (!all.some((s) => s.telegramId === id)) {
      return res.status(404).json({ error: "Subscription not found" });
    }
    await fleet2.subscriptions.remove(id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete subscription" });
  }
});

export default router;
