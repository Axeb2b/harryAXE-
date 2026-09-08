import { Router } from "express";
import { ADMIN_TG_ID } from "../lib/admin";
import { requireAuth } from "../middlewares/auth";
import { getBot } from "../bot/index";

/**
 * POST /api/telegram/send
 * Sends a text message to a Telegram chat from the bot.
 * Default target: admin DM. Optional { chatId } override.
 * Used by the panel's "Send to Telegram" export actions.
 */

const router = Router();

router.post("/telegram/send", requireAuth, async (req, res) => {
  try {
    const { text, chatId } = req.body ?? {};
    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const bot = getBot();
    if (!bot) {
      res.status(503).json({ error: "Bot not running" });
      return;
    }
    const target = chatId ? String(chatId) : ADMIN_TG_ID;
    const safe =
      text.length > 3500 ? text.slice(0, 3500) + "\n…(truncated)" : text;
    await bot.telegram.sendMessage(target, safe, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
    res.json({ success: true, chatId: target });
  } catch (err: any) {
    console.error("Telegram send error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Send failed" });
  }
});

export default router;
