/**
 * Plan catalog — single source of truth for plan tiers and feature flags.
 * Mirrored in the web panel (web-panel/src/lib/plans.ts).
 */

export interface PlanFeatures {
  /** Max connected devices a user may own (null = unlimited) */
  deviceLimit: number | null;
  /** Finance/bank SMS scanning + filters in panel */
  financeScan: boolean;
  /** Category classification + amount extraction on SMS */
  smsInfo: boolean;
  /** Multi-Firebase aggregation access */
  multiFirebase: boolean;
  /** Per-user APK downloads */
  apkAccess: boolean;
  /** Priority telegram support */
  prioritySupport: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price: string;
  tagline: string;
  features: PlanFeatures;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "FREE",
    name: "Free",
    price: "₹0",
    tagline: "Basic SMS sync for one device",
    features: {
      deviceLimit: 1,
      financeScan: false,
      smsInfo: false,
      multiFirebase: false,
      apkAccess: false,
      prioritySupport: false,
    },
  },
  {
    id: "PRO",
    name: "Pro",
    price: "₹499/mo",
    tagline: "Finance intelligence for serious users",
    popular: true,
    features: {
      deviceLimit: 5,
      financeScan: true,
      smsInfo: true,
      multiFirebase: false,
      apkAccess: true,
      prioritySupport: false,
    },
  },
  {
    id: "VIP",
    name: "VIP",
    price: "₹999/mo",
    tagline: "Everything, unlimited, priority",
    features: {
      deviceLimit: null,
      financeScan: true,
      smsInfo: true,
      multiFirebase: true,
      apkAccess: true,
      prioritySupport: true,
    },
  },
];

export function getPlan(id?: string | null): Plan {
  const plan = PLANS.find((p) => p.id === (id || "").toUpperCase());
  // Custom/legacy plans (e.g. "30 Days") get Pro-level access by default
  return plan || PLANS[1];
}

export function planFeatureLabel(f: PlanFeatures): string[] {
  const labels: string[] = [];
  labels.push(f.deviceLimit === null ? "Unlimited devices" : `${f.deviceLimit} device${f.deviceLimit === 1 ? "" : "s"}`);
  if (f.financeScan) labels.push("Bank & finance SMS sorting");
  if (f.smsInfo) labels.push("Amounts, banks & transaction info");
  if (f.multiFirebase) labels.push("Multi-Firebase aggregation");
  if (f.apkAccess) labels.push("APK downloads");
  if (f.prioritySupport) labels.push("Priority support");
  return labels;
}
