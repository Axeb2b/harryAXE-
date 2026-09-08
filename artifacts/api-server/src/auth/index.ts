// Auth — deep module at the bearer seam (see CONTEXT.md: Auth)
// Owns session bearer telegramId:sessionId, isAdmin set (5064888403,5741539104), expiry, bcrypt.
export interface Auth {
  login(
    email: string,
    password: string
  ): Promise<{ telegramId: string; requiresOtp: true } | { error: string }>;
  verify(
    telegramId: string,
    otp: string,
    device: string,
    ip: string
  ): Promise<{ bearer: string; isAdmin: boolean } | { error: string }>;
  verifyBearer(
    header: string | undefined
  ): Promise<{
    telegramId: string;
    isAdmin: boolean;
    sessionId: string;
  } | null>;
  isAdmin(id: string | number): boolean;
}
// Details: verifyBearer checks config/sessions/{id}/{sid}.expiresAt, bumps lastSeen, uses fleet.isActive for non-admin.
// Passwords: bcrypt $2b$ (cost 10), lazy migration from plaintext. Sessions: crypto.randomUUID + 24h expiry, 7-day grace for legacy.
// Depends on Fleet for isActive, but hides it — callers know Auth, not Fleet.
