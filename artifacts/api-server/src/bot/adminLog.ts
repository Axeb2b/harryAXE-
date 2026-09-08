import { Telegraf } from "telegraf";
import { ADMIN_TG_ID } from "../lib/admin";
import { logger } from "../lib/logger";

/**
 * Admin activity log — pushes compact log messages to the admin's Telegram
 * DM. Rate-limited to ~1 msg / 1.5s so bursts never trip Telegram's 429.
 */

let botRef: Telegraf | null = null;
let lastSent = 0;
const MIN_GAP = 1500;

export function setLogBot(bot: Telegraf): void {
  botRef = bot;
}

export async function adminLog(text: string): Promise<void> {
  if (!botRef) return;
  const now = Date.now();
  const wait = Math.max(0, lastSent + MIN_GAP - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    await botRef.telegram.sendMessage(ADMIN_TG_ID, text, {
      parse_mode: "Markdown",
    });
    lastSent = Date.now();
  } catch (err: any) {
    logger.error({ err }, "adminLog send failed");
  }
}
