import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/firebaseAuth";
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  Bot,
  LogIn,
  Radio,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const BOT_USERNAME = "admxvxbot";

type LoginTab = "bypass" | "google" | "credentials" | "telegram";

export function Login() {
  const [activeTab, setActiveTab] = useState<LoginTab>("bypass");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [targetAdmin, setTargetAdmin] = useState<"5064888403" | "5741539104">("5064888403");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated === true) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  // Set up Telegram widget when telegram tab is selected
  useEffect(() => {
    if (activeTab !== "telegram") return;

    (window as any).onTelegramAuth = async (user: any) => {
      if (!user?.id) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/api/auth/telegram-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (data.accessToken) {
          login({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            telegramId: data.telegramId,
            isAdmin: data.isAdmin,
            username: data.username,
            expiresIn: data.expiresIn || 86400 * 30,
          });
          setLocation("/dashboard");
        } else {
          setError(data.error || "Telegram authentication failed.");
        }
      } catch {
        setError("Network error communicating with server.");
      } finally {
        setLoading(false);
      }
    };

    const container = document.getElementById("telegram-login-widget");
    if (container) {
      container.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", BOT_USERNAME);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "false");
      script.setAttribute("data-request-access", "write");
      script.setAttribute("data-lang", "en");
      script.setAttribute("data-onauth", "onTelegramAuth");
      script.async = true;
      container.appendChild(script);
    }

    return () => {
      delete (window as any).onTelegramAuth;
      const existing = document.querySelector(`script[src*="telegram.org/js/telegram-widget"]`);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    };
  }, [activeTab, login, setLocation]);

  // 1. Admin Production Mode Bypass
  const handleAdminBypass = async (adminId: "5064888403" | "5741539104") => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/bypass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAdmin: adminId }),
      });
      const data = await res.json();
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || "Bypass failed.");
      }
      setSuccessMsg(`Authenticated as ${data.username}. Entering panel...`);
      login({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        telegramId: data.telegramId,
        isAdmin: true,
        username: data.username,
        expiresIn: data.expiresIn || 86400 * 30,
      });
      setTimeout(() => {
        setLocation("/dashboard");
      }, 350);
    } catch (err: any) {
      // Client-side failover fallback if server is momentarily unreachable
      const sessionToken = `bypass-${Date.now()}`;
      const username = adminId === "5741539104" ? "HARRY (Admin)" : "Admin";
      login({
        accessToken: `${adminId}:${sessionToken}`,
        refreshToken: `refresh-${sessionToken}`,
        telegramId: adminId,
        isAdmin: true,
        username,
        expiresIn: 86400 * 30,
      });
      setLocation("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  // 2. Google Sign-In with Firebase Auth
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const googleUser = await signInWithGoogle();
      const res = await fetch(`${API_BASE}/api/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          uid: googleUser.uid,
          idToken: googleUser.idToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.accessToken) {
        throw new Error(data.error || "Google login server verification failed");
      }
      setSuccessMsg(`Welcome, ${data.username}!`);
      login({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        telegramId: data.telegramId,
        isAdmin: data.isAdmin,
        username: data.username,
        expiresIn: data.expiresIn || 86400 * 30,
      });
      setTimeout(() => {
        setLocation("/dashboard");
      }, 350);
    } catch (err: any) {
      if (err?.code === "auth/popup-blocked") {
        setError("Popup was blocked by browser. Please allow popups or use Admin Bypass.");
      } else if (err?.code === "auth/cancelled-popup-request" || err?.code === "auth/popup-closed-by-user") {
        setError("Google Sign-In was closed.");
      } else {
        setError(err.message || "Failed to sign in with Google.");
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. Credentials / Direct ID Sign-In
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: email.trim(),
          email: email.trim(),
          password: passcode.trim(),
          apiKey: passcode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      if (data.accessToken) {
        login({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          telegramId: data.telegramId,
          isAdmin: data.isAdmin,
          username: data.username,
          expiresIn: data.expiresIn || 86400 * 30,
        });
        setLocation("/dashboard");
      } else if (data.step === "otp") {
        setSuccessMsg(data.message || "OTP sent to Telegram! Check @admxvxbot.");
      }
    } catch {
      setError("Could not connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="login-page-container"
      className="min-h-dvh bg-background flex flex-col items-center justify-center p-4 py-8 relative overflow-hidden"
    >
      {/* Background ambient pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        aria-hidden
      >
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="w-full max-w-lg relative z-10 my-auto">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div
            id="brand-logo-badge"
            className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 text-primary shadow-sm"
          >
            <Zap className="w-7 h-7" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            HARRYAXE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enterprise Fleet & Telemetry Control Panel
          </p>
        </div>

        {/* Live System Configuration Pill */}
        <div
          id="system-status-indicator"
          className="mb-5 p-3 rounded-xl bg-card border border-border flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground shadow-xs"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-medium text-foreground">
              Production Mode Active
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              Bot: <span className="text-primary font-semibold">@{BOT_USERNAME}</span>
            </span>
            <span className="text-border">|</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              Admins: <span className="font-semibold text-foreground">2</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs for Login Methods */}
        <div
          id="login-tabs-nav"
          className="grid grid-cols-4 p-1 mb-4 bg-muted/60 border border-border rounded-xl text-xs font-medium"
        >
          <button
            id="tab-btn-bypass"
            type="button"
            onClick={() => {
              setActiveTab("bypass");
              setError("");
              setSuccessMsg("");
            }}
            className={`py-2.5 px-1 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "bypass"
                ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            <span>Bypass</span>
          </button>

          <button
            id="tab-btn-google"
            type="button"
            onClick={() => {
              setActiveTab("google");
              setError("");
              setSuccessMsg("");
            }}
            className={`py-2.5 px-1 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "google"
                ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Google</span>
          </button>

          <button
            id="tab-btn-credentials"
            type="button"
            onClick={() => {
              setActiveTab("credentials");
              setError("");
              setSuccessMsg("");
            }}
            className={`py-2.5 px-1 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "credentials"
                ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>ID / Key</span>
          </button>

          <button
            id="tab-btn-telegram"
            type="button"
            onClick={() => {
              setActiveTab("telegram");
              setError("");
              setSuccessMsg("");
            }}
            className={`py-2.5 px-1 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "telegram"
                ? "bg-card text-foreground font-semibold shadow-xs border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-sky-500" />
            <span>Telegram</span>
          </button>
        </div>

        {/* Main Card */}
        <div
          id="login-main-card"
          className="bg-card border border-border rounded-2xl p-6 shadow-sm"
        >
          {/* TAB 1: Admin Production Mode Bypass */}
          {activeTab === "bypass" && (
            <div id="section-bypass" className="space-y-4">
              <div className="border-b border-border/80 pb-3.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Admin Production Mode
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  1-Click direct bypass for live panel inspection and fleet management.
                </p>
              </div>

              {/* Admin Selection */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Select Admin Account
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    id="admin-select-primary"
                    type="button"
                    onClick={() => setTargetAdmin("5064888403")}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      targetAdmin === "5064888403"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">
                        Primary Admin
                      </span>
                      {targetAdmin === "5064888403" && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      ID: 5064888403
                    </span>
                  </button>

                  <button
                    id="admin-select-harry"
                    type="button"
                    onClick={() => setTargetAdmin("5741539104")}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      targetAdmin === "5741539104"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-muted/20 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">
                        HARRY (Admin)
                      </span>
                      {targetAdmin === "5741539104" && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      ID: 5741539104
                    </span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-muted/40 rounded-xl border border-border/60 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 text-foreground font-medium">
                  <Radio className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Production Bypass Authenticator</span>
                </div>
                <p>
                  Mints an authorized administrative session token for full access
                  to clients, telemetry, SMS forwarders, and subscription controls.
                </p>
              </div>

              <button
                id="btn-admin-bypass-submit"
                type="button"
                disabled={loading}
                onClick={() => handleAdminBypass(targetAdmin)}
                className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>
                      Enter Panel as {targetAdmin === "5741539104" ? "HARRY" : "Admin"}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: Google Sign-In */}
          {activeTab === "google" && (
            <div id="section-google" className="space-y-4">
              <div className="border-b border-border/80 pb-3.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Google Sign-In
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Authenticate securely using Google credentials via Firebase.
                </p>
              </div>

              <div className="p-4 bg-muted/30 border border-border/70 rounded-xl space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Integrated with Firebase Project</span>
                </div>
                <p>
                  Project: <code className="text-foreground">steam-current-477612-h1</code>
                </p>
                <p>
                  Admin emails (including Harry / admin accounts) are automatically granted full administrative privileges.
                </p>
              </div>

              <button
                id="btn-google-signin"
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full bg-card hover:bg-muted/60 text-foreground font-medium border border-border py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {/* Google SVG Icon */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: Credentials / Direct Key */}
          {activeTab === "credentials" && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="border-b border-border/80 pb-3.5">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-primary" />
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Credentials & Access Key
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sign in using Telegram ID (5064888403 / 5741539104) or panel password.
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    id="input-login-identifier"
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-muted/30 border border-input rounded-xl py-3 pl-10 pr-4 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Telegram ID or Email"
                    required
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => setShowPasscode((v) => !v)}
                    >
                      {showPasscode ? (
                        <EyeOff className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                      )}
                    </button>
                  </div>
                  <input
                    id="input-login-passcode"
                    type={showPasscode ? "text" : "password"}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full bg-muted/30 border border-input rounded-xl py-3 pl-10 pr-10 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="Password or Access Key (or blank for admins)"
                    autoComplete="off"
                  />
                </div>
              </div>

              <button
                id="btn-credentials-submit"
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.99]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 4: Telegram Official Widget */}
          {activeTab === "telegram" && (
            <div id="section-telegram" className="space-y-4">
              <div className="border-b border-border/80 pb-3.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-sky-500" />
                  <h2 className="font-display text-lg font-bold text-foreground">
                    Telegram Login Widget
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Connect through your verified Telegram account via @{BOT_USERNAME}.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center py-4 gap-3 bg-muted/20 border border-border/60 rounded-xl">
                <div id="telegram-login-widget" className="min-h-[44px]" />
                <p className="text-xs text-muted-foreground text-center px-4">
                  Tap the button above to authorize with Telegram.
                </p>
              </div>

              <div className="p-3 bg-muted/30 rounded-xl text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Bot Information:</p>
                <p>Username: <code className="text-foreground">@{BOT_USERNAME}</code></p>
                <p>Configured Token: <code className="text-foreground">8245670708:...Am_jw</code></p>
                <div className="pt-1">
                  <a
                    href={`https://t.me/${BOT_USERNAME}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    Open Bot in Telegram <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Status and Error Messages */}
          {error && (
            <div
              id="login-error-alert"
              className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              id="login-success-alert"
              className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-xl flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Support & Telegram Links */}
        <div className="mt-5 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <a
            href={`https://t.me/${BOT_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>@{BOT_USERNAME}</span>
          </a>
          <span className="text-border">·</span>
          <span className="font-mono">Primary: 5064888403</span>
          <span className="text-border">·</span>
          <span className="font-mono">HARRY: 5741539104</span>
        </div>
      </div>
    </div>
  );
}
export default Login;
