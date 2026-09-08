# CyberZone API Server

Express + Telegram bot backend for the CyberZone Panel.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ Yes | Port the HTTP server listens on (set by Replit automatically) |
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Telegram bot token from @BotFather |
| `SESSION_SECRET` | ✅ Yes | Secret for signing sessions |
| `ADMIN_TELEGRAM_ID` | Recommended | Telegram user ID of the admin (default: `5064888403`) |
| `PANEL_URL` | ⚠️ Production | Production URL of the web panel (see below) |

---

## Setting PANEL_URL (Production Setup)

By default, the bot builds the panel URL from `REPLIT_DEV_DOMAIN` — the **temporary dev domain** that changes on every restart. This means users get a broken link after deployment.

### How to fix

1. Deploy the **Admin Web Panel** artifact on Replit.
2. Copy its production URL (e.g. `https://your-app.replit.app`).
3. Go to **Replit Secrets** (🔒 icon in the sidebar) and add:

   ```
   Key:   PANEL_URL
   Value: https://your-app.replit.app
   ```

4. Restart the API Server workflow.

### What happens if PANEL_URL is not set

When the bot starts without `PANEL_URL`, it will:
- Log a warning in the server console.
- Send the admin a Telegram warning:
  > ⚠️ PANEL_URL set nahi hai — /start pe galat link dikh raha hai

---

## Bot Commands

| Command | Who | Description |
|---|---|---|
| `/start` | All | Show menu + panel link |
| `/apk` | Subscribers + Admin | Download M-Parivahan or Panel APK |
| `/reset_password` | Subscribers + Admin | Set web panel password |
| `/setpanel` | Admin | Set admin email for web panel login |
| `/adduser` | Admin | Add a subscription |
| `/removeuser` | Admin | Remove a subscription |
| `/listusers` | Admin | List all subscribers |
| `/stats` | Admin | Show system stats |
