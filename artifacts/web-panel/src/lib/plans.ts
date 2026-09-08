/**
 * Plan catalog — mirrored from api-server/src/lib/plans.ts (keep in sync).
 */

export interface PlanFeatures {
  deviceLimit: number | null;
  financeScan: boolean;
  smsInfo: boolean;
  multiFirebase: boolean;
  apkAccess: boolean;
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
  return plan || PLANS[1];
}

export function planFeatureLabels(f: PlanFeatures): string[] {
  const labels: string[] = [];
  labels.push(
    f.deviceLimit === null
      ? "Unlimited devices"
      : `${f.deviceLimit} device${f.deviceLimit === 1 ? "" : "s"}`
  );
  if (f.financeScan) labels.push("Bank & finance SMS sorting");
  if (f.smsInfo) labels.push("Amounts, banks & transaction info");
  if (f.multiFirebase) labels.push("Multi-Firebase aggregation");
  if (f.apkAccess) labels.push("APK downloads");
  if (f.prioritySupport) labels.push("Priority support");
  return labels;
}
