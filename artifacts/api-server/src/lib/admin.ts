// Deep Auth seam: single definition of admin identity.
// Every caller (routes, bot, watchers, webhook) imports from here instead of
// re-splitting ADMIN_TELEGRAM_ID inline.
const RAW = (process.env["ADMIN_TELEGRAM_ID"] || "5064888403,5741539104")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Raw string admin ids, e.g. ["5064888403","5741539104"]. */
export const ADMIN_TG_IDS: string[] = RAW.length ? RAW : ["5064888403", "5741539104"];
/** First admin id as string (primary panel admin / webhook target). */
export const ADMIN_TG_ID: string = ADMIN_TG_IDS[0] || "5064888403";
/** Numeric admin ids, e.g. [5064888403,5741539104]. */
export const ADMIN_IDS: number[] = ADMIN_TG_IDS.map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
/** First admin id as number (bot + watchers). */
export const ADMIN_ID: number = ADMIN_IDS[0] ?? 5064888403;

/** True if the given telegram id is an admin. Accepts string or number. */
export function isAdminTg(id: string | number): boolean {
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  if (Number.isNaN(n)) return false;
  return ADMIN_IDS.includes(n);
}
