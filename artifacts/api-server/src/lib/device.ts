export type NormalizedDevice = {
  id: string;
  model: string;
  phone: string;
  isOnline: boolean;
  raw: Record<string, any>;
};

// Device module — deep, owns isOnline + fromRaw (see CONTEXT.md: Device)
// Reuse web-panel normalizeDevice as single source (SmsIntelligence locality)
export function isOnline(raw: any, now = Date.now()): boolean {
  const t = raw?.ping ?? raw?.lastPing ?? null;
  if (t != null) {
    const n = Number(t);
    if (!isNaN(n)) return now - n < 300_000;
  }
  if (typeof raw?.status === "boolean") return raw.status;
  if (typeof raw?.status === "string")
    return raw.status === "true" || raw.status === "online";
  return false;
}

export async function fromRaw(
  id: string,
  raw: Record<string, any>
): Promise<NormalizedDevice> {
  // Local normalize — keep Device deep module locality, avoid cross-workspace rootDir violation
  const model = (raw as any).modelName || (raw as any).model || "Unknown";
  const phone = (raw as any).mobNo || (raw as any).phone || "";
  const isOnline = (() => {
    const v = (raw as any).ping ?? (raw as any).lastPing;
    if (v != null) {
      const n = Number(v);
      if (!isNaN(n)) return Date.now() - n < 300_000;
    }
    if (typeof (raw as any).status === "boolean") return (raw as any).status;
    if (typeof (raw as any).status === "string")
      return (raw as any).status === "true" || (raw as any).status === "online";
    return false;
  })();
  return { id, model, phone, isOnline, raw } as NormalizedDevice;
}

export function matchesFilter(dev: any, q: string, filter: string): boolean {
  if (!q && filter === "all") return true;
  const hay =
    `${dev.model || ""} ${dev.phone || ""} ${dev.upi || ""} ${dev.id || ""}`.toLowerCase();
  if (q && !hay.includes(q.toLowerCase())) return false;
  if (filter === "online" && !isOnline(dev)) return false;
  if (filter === "offline" && isOnline(dev)) return false;
  return true;
}
