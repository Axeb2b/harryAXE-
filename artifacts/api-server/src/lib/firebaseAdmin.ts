/**
 * Firebase custom-token minting — signs a standard Firebase custom token
 * locally with the service account private key (no firebase-admin needed).
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";

let saCache: { clientEmail: string; privateKey: string } | null | undefined;

function loadSA(): { clientEmail: string; privateKey: string } | null {
  if (saCache !== undefined) return saCache;
  try {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
    const saPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS || "/root/firebase-service-account.json";
    const parsed = inline
      ? (JSON.parse(inline) as any)
      : (fs.existsSync(saPath) ? (JSON.parse(fs.readFileSync(saPath, "utf-8")) as any) : null);
    if (parsed?.client_email && parsed?.private_key) {
      saCache = { clientEmail: parsed.client_email, privateKey: parsed.private_key };
      return saCache;
    }
  } catch (err) {
    console.warn("Could not load Firebase service account:", err);
  }
  saCache = null;
  return null;
}

/** Mint a Firebase custom token for a given UID (used by the web panel). */
export async function mintFirebaseToken(uid: string): Promise<string> {
  const sa = loadSA();
  if (!sa) {
    return `custom-mock-token-${uid}-${Date.now()}`;
  }
  const now = Math.floor(Date.now() / 1000);
  const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64u({ alg: "RS256", typ: "JWT" });
  const claims = b64u({
    iss: sa.clientEmail,
    sub: sa.clientEmail,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid: String(uid),
  });
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), sa.privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}
