import type { NormalizedDevice } from "./normalizeDevice";

export type FleetFilterMode =
  | "all"
  | "online"
  | "offline"
  | "pinned"
  | "upi"
  | "cards"
  | "bank"
  | "verified";

export type FleetSortMode = "newest" | "oldest" | "name" | "battery";

export interface FleetFilterInput {
  devices: NormalizedDevice[];
  search?: string;
  filter?: FleetFilterMode;
  group?: string;
  pinnedIds?: Set<string>;
  sortMode?: FleetSortMode;
}

export function hasCards(d: NormalizedDevice): boolean {
  return (
    Object.keys(d.raw || {}).some(
      (k) => k.startsWith("cc_") || k === "cards" || k === "cc"
    ) ||
    !!d.raw?.cardNumber ||
    !!d.raw?.cc_cardNumber
  );
}

export function getBatteryValue(battery: unknown): number {
  return parseInt(String(battery ?? "").replace("%", ""), 10) || 0;
}

function joinedOf(d: NormalizedDevice): number {
  return d.joinedTs || d.lastPing || Number(d.raw.ping || 0) || 0;
}

/**
 * Apply search + filter + group + sort to a device list.
 * Pure and deterministic — no side effects, easy to test.
 */
export function filterFleet(input: FleetFilterInput): NormalizedDevice[] {
  const {
    devices,
    search = "",
    filter = "all",
    group = "all",
    pinnedIds = new Set<string>(),
    sortMode = "newest",
  } = input;

  let base = devices;

  if (search) {
    const q = search.toLowerCase();
    base = base.filter(
      (d) =>
        d.phone.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        d.upi.toLowerCase().includes(q) ||
        (d.deviceName || "").toLowerCase().includes(q) ||
        (d.group || "").toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.ip_address || "").includes(q)
    );
  }

  if (group !== "all") base = base.filter((d) => d.group === group);

  switch (filter) {
    case "online":
      base = base.filter((d) => d.isOnline);
      break;
    case "offline":
      base = base.filter((d) => !d.isOnline);
      break;
    case "pinned":
      base = base.filter((d) => pinnedIds.has(d.id));
      break;
    case "upi":
      base = base.filter((d) => d.upi);
      break;
    case "cards":
      base = base.filter(hasCards);
      break;
    case "verified":
      base = base.filter((d) => d.hasMessages || d.isVerified || (d.messageCount && d.messageCount > 0));
      break;
    case "bank":
      // bank SMS filtered in the SMS page
      break;
  }

  const sorted = [...base];
  switch (sortMode) {
    case "newest":
      sorted.sort((a, b) => joinedOf(b) - joinedOf(a));
      break;
    case "oldest":
      sorted.sort((a, b) => joinedOf(a) - joinedOf(b));
      break;
    case "name":
      sorted.sort((a, b) => a.model.localeCompare(b.model));
      break;
    case "battery":
      sorted.sort(
        (a, b) => getBatteryValue(b.battery) - getBatteryValue(a.battery)
      );
      break;
  }

  return sorted.sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 0 : 1;
    const bPinned = pinnedIds.has(b.id) ? 0 : 1;
    return aPinned - bPinned;
  });
}
