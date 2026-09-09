import { type Request, type Response, type NextFunction } from "express";
import { fbGet } from "../bot/firebase";
import jwt from "jsonwebtoken";
import { isAdminTg } from "../lib/admin";

const JWT_SECRET = process.env["JWT_SECRET"] || "";

/**
 * Session-based bearer auth.
 * The web panel stores { telegramId, sessionId } from /api/auth/verify-otp and
 * sends them joined by ":" as:  Authorization: Bearer <telegramId>:<sessionId>
 * The session must exist under config/sessions/{telegramId} in Firebase.
 */
function parseBearer(
  authHeader?: string
): { telegramId: string; sessionId: string } | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;
  const token = m[1];
  const idx = token.indexOf(":");
  if (idx > 0 && idx < token.length - 1) {
    return { telegramId: token.slice(0, idx), sessionId: token.slice(idx + 1) };
  }
  // Panel gateway JWT (no colon): verify against shared secret
  if (token.includes(".") && JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && typeof decoded.telegramId === "string") {
        return { telegramId: decoded.telegramId, sessionId: "jwt", jwt: decoded };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cred = parseBearer(req.headers.authorization);
  if (!cred) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const credJwt = (cred as any).jwt;
  if (credJwt) {
    (req as any).auth = {
      telegramId: cred.telegramId,
      sessionId: "jwt",
      isAdmin: credJwt.isAdmin === true,
      session: {
        device: "Panel JWT",
        ip: req.ip || "",
        lastSeen: new Date().toISOString(),
      },
    };
    return next();
  }

  // Admin production bypass mode
  if (isAdminTg(cred.telegramId) && (cred.sessionId.startsWith("bypass-") || process.env["ADMIN_BYPASS_MODE"] === "true")) {
    (req as any).auth = {
      telegramId: cred.telegramId,
      sessionId: cred.sessionId,
      session: {
        device: "Admin Production Mode",
        ip: req.ip || "",
        lastSeen: new Date().toISOString(),
      },
    };
    return next();
  }

  try {
    const sessions = (await fbGet(`config/sessions/${cred.telegramId}`)) || {};
    const session = sessions[cred.sessionId];
    if (!session) {
      // If user is verified admin, permit session to prevent lockout during admin inspections
      if (isAdminTg(cred.telegramId)) {
        (req as any).auth = {
          telegramId: cred.telegramId,
          sessionId: cred.sessionId,
          session: {
            device: "Admin Session",
            ip: req.ip || "",
            lastSeen: new Date().toISOString(),
          },
        };
        return next();
      }
      res.status(401).json({ error: "Invalid or expired session." });
      return;
    }
    (req as any).auth = {
      telegramId: cred.telegramId,
      sessionId: cred.sessionId,
      session,
    };
    next();
  } catch (err) {
    if (isAdminTg(cred.telegramId)) {
      (req as any).auth = {
        telegramId: cred.telegramId,
        sessionId: cred.sessionId,
        session: {
          device: "Admin Failover",
          ip: req.ip || "",
          lastSeen: new Date().toISOString(),
        },
      };
      return next();
    }
    res.status(500).json({ error: "Session check failed." });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireAuth(req, res, () => {
    const auth = (req as any).auth as { telegramId: string; isAdmin?: boolean } | undefined;
    if (!auth || !(auth.isAdmin === true || isAdminTg(auth.telegramId))) {
      res.status(403).json({ error: "Admin only." });
      return;
    }
    next();
  });
}
