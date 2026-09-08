import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/vps-sync", (req, res) => {
  const customPanelUrl = process.env["PANEL_URL"];
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const detectedUrl = `${proto}://${host}`;
  const panelUrl = customPanelUrl || (host ? detectedUrl : "https://panel.kimiaxe.com");

  res.json({
    status: "synced",
    panelUrl,
    vpsUrl: "https://panel.kimiaxe.com",
    rtdbUrl: process.env["FIREBASE_DB_URL"] || "https://axexodiweb-default-rtdb.firebaseio.com",
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

export default router;
