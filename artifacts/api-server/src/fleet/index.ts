// Fleet — deep module behind a domain seam (see CONTEXT.md: Fleet)
// Interface is domain operations, not RTDB paths. Two adapters: RtdbFleet (prod) + InMemoryFleet (tests) = real seam.
// Hybrid: Agent3 surface (5 methods, login trivial) + Agent1 path-registry inside.

export type NormalizedDevice = {
  id: string;
  model: string;
  phone: string;
  isOnline: boolean;
  raw: Record<string, any>;
}; // local stub, see lib/device.ts

export type TelegramId = string;

export type Subscription = {
  telegramId: TelegramId;
  username: string;
  email?: string;
  plan: string;
  status: "active" | "expired";
  expiresAt: number | null;
  createdAt: number | null;
  panelPassword?: string;
};

export type OtpTicket = {
  telegramId: TelegramId;
  maskedTo: string;
};

export type AuthPrincipal = {
  telegramId: TelegramId;
  kind: "admin" | "subscriber";
  username: string;
  email: string;
};

export type Forwarding = {
  callNumber: string;
  smsNumber: string;
};

export class FleetError extends Error {
  code:
    | "NOT_FOUND"
    | "BAD_CREDENTIALS"
    | "FORBIDDEN"
    | "OTP_EXPIRED"
    | "OTP_MISMATCH"
    | "OTP_NOT_FOUND"
    | "UNAVAILABLE";
  constructor(code: FleetError["code"], message?: string) {
    super(message || code);
    this.code = code;
  }
}

export interface Fleet {
  // Most common caller: one call hides identifier normalization, admin+subscription fan-out, password check, isActive+lazy expire, OTP create + Telegram send
  login(input: { identifier: string; password: string }): Promise<OtpTicket>;
  verifyOtp(input: {
    telegramId: TelegramId;
    code: string;
  }): Promise<AuthPrincipal>;
  subscriptions: {
    list(): Promise<Subscription[]>;
    upsert(input: {
      telegramId: TelegramId;
      days: number;
      username?: string;
      email?: string;
      panelPassword?: string;
      plan?: string;
    }): Promise<Subscription>;
    remove(telegramId: TelegramId): Promise<void>;
    isActive(telegramId: TelegramId): Promise<boolean>;
  };
  devices: {
    list(filter?: { ownerId?: string }): Promise<NormalizedDevice[]>;
    get(id: string): Promise<NormalizedDevice | null>;
  };
  forwarding: {
    getDefaults(): Promise<Forwarding>;
    setDefaults(patch: Partial<Forwarding>): Promise<void>;
  };
}

// Factory — dependencies accepted, not created (testable)
export type FleetDeps = {
  rtdb: RtdbPort;
  notifier: OtpNotifierPort;
  now?: () => number;
};

// createFleet implemented in ./rtdbFleet.ts

// Ports — internal seams, not exported to callers
export interface RtdbPort {
  get(path: string): Promise<unknown | null>;
  set(path: string, value: unknown): Promise<void>;
  patch?(path: string, value: unknown): Promise<void>;
  remove(path: string): Promise<void>;
  listFirebases?(): Promise<
    Array<{ id: string; dbUrl: string; port: RtdbPort }>
  >;
}

export interface OtpNotifierPort {
  sendOtp(to: TelegramId, code: string): Promise<void>;
}
