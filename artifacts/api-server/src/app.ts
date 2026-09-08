import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getWebhookHandler } from "./bot/index";

const app: Express = express();
app.set('trust proxy', 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
// Rate limit: 100 req/15min per IP (fleet locality: one place)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Session revalidation fires on every page load — a 429 here must
    // never read as "logged out". Same for the health probe.
    skip: (req) => req.path === "/api/auth/me" || req.path === "/healthz",
  })
);
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

// Telegram bot webhook endpoint (used by nginx /bot-webhook proxy)
app.post("/bot-webhook", (req, res) => {
  const handler = getWebhookHandler();
  if (handler) {
    handler(req, res);
  } else {
    res.sendStatus(200);
  }
});

// ── Serve the built web panel (production static hosting) ──────────────
const webPanelDist =
  process.env["WEB_PANEL_DIST"] ??
  (fs.existsSync(path.resolve(process.cwd(), "artifacts/web-panel/dist/public"))
    ? path.resolve(process.cwd(), "artifacts/web-panel/dist/public")
    : path.resolve(import.meta.dirname, "../../web-panel/dist/public"));

app.use(express.static(webPanelDist));

// SPA fallback — send index.html for all non-API GET routes
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api") || req.path === "/healthz" || req.path === "/bot-webhook") {
    return next();
  }
  const indexPath = path.join(webPanelDist, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

export default app;
