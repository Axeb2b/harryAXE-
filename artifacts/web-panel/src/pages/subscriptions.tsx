import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  Plus,
  Trash2,
  Users,
  Crown,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Copy,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/apiFetch";

const PLAN_IDS: Record<string, string> = {
  "1 Week": "week",
  "1 Month": "month",
  "3 Months": "3mo",
  "6 Months": "6mo",
  "1 Year": "year",
  Lifetime: "lifetime",
};
const getPlan = (label: string) => ({
  id: PLAN_IDS[label] || label.replace(/\s+/g, "_").toLowerCase(),
});

interface Subscription {
  planMeta?: { id: string; name: string } | null;
  telegramId: string;
  username: string;
  plan: string;
  status: "active" | "expired";
  expiresAt: number | null;
  createdAt: number | null;
  daysLeft: number | null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers: authHeaders(opts?.headers as Record<string, string> | undefined),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return (
    new Date(ts).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " IST"
  );
}

export function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    telegramId: "",
    username: "",
    email: "",
    panelPassword: "",
    days: "30",
    plan: "1 Month",
  });

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/subscriptions");
      setSubs(data.subscriptions || []);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load subscriptions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.telegramId || !form.days) return;

    setSubmitting(true);
    try {
      await apiFetch("/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      toast({
        title: "Success",
        description: `Subscription added for ${form.username || form.telegramId}`,
      });
      setShowForm(false);
      setForm({
        telegramId: "",
        username: "",
        email: "",
        panelPassword: "",
        days: "30",
        plan: "1 Month",
      });
      fetchSubs();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Remove subscription for ${username || id}?`)) return;
    setDeleting(id);
    try {
      await apiFetch(`/subscriptions/${id}`, { method: "DELETE" });
      toast({
        title: "Removed",
        description: `Subscription for ${username || id} removed`,
      });
      setSubs((prev) => prev.filter((s) => s.telegramId !== id));
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: "Copied", description: "Telegram ID copied" });
  };

  const activeSubs = subs.filter((s) => s.status === "active");
  const expiredSubs = subs.filter((s) => s.status === "expired");

  return (
    <Layout>
      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="page-eyebrow">Admin</p>
          <h1 className="page-title flex items-center gap-2">
            <Crown className="w-6 h-6 text-primary" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeSubs.length} active / {subs.length} total
          </p>
        </div>
        <div className="flex gap-2 sm:flex-shrink-0">
          <button
            onClick={fetchSubs}
            className="flex items-center justify-center gap-2 px-4 h-11 border border-input rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary active:bg-muted transition-all bg-card"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 px-5 h-11 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-6 stat-card p-5">
          <h3 className="page-eyebrow text-primary mb-4">New Subscription</h3>
          <form
            onSubmit={handleAdd}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <div>
              <label className="page-eyebrow block mb-1">Telegram ID *</label>
              <input
                type="text"
                placeholder="123456789"
                value={form.telegramId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, telegramId: e.target.value }))
                }
                required
                className="w-full bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
              />
            </div>
            <div>
              <label className="page-eyebrow block mb-1">Username</label>
              <input
                type="text"
                placeholder="@username"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    username: e.target.value.replace("@", ""),
                  }))
                }
                className="w-full bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
              />
            </div>
            <div>
              <label className="page-eyebrow block mb-1">Days</label>
              <div className="relative">
                <select
                  value={form.days}
                  onChange={(e) => {
                    const d = e.target.value;
                    const labels: Record<string, string> = {
                      "7": "1 Week",
                      "30": "1 Month",
                      "90": "3 Months",
                      "180": "6 Months",
                      "365": "1 Year",
                      "36500": "Lifetime",
                    };
                    setForm((f) => ({
                      ...f,
                      days: d,
                      plan: labels[d] || `${d} Days`,
                    }));
                  }}
                  className="w-full bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all appearance-none"
                >
                  <option value="7">7 Days</option>
                  <option value="30">1 Month (30 Days)</option>
                  <option value="90">3 Months</option>
                  <option value="180">6 Months</option>
                  <option value="365">1 Year</option>
                  <option value="36500">Lifetime</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="page-eyebrow block mb-1">
                Plan Tier{" "}
                <span className="text-muted-foreground">(Pro default)</span>
              </label>
              <div className="flex gap-2">
                {["FREE", "PRO", "VIP"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, plan: t }))}
                    className={`flex-1 px-3 py-3 rounded-xl border text-sm font-semibold transition-all ${
                      form.plan === t
                        ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                        : "bg-card border-input text-muted-foreground hover:border-primary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                FREE: 1 device · PRO: 5 devices + finance scan · VIP: unlimited
                + multi-Firebase
              </p>
            </div>
            <div>
              <label className="page-eyebrow block mb-1">
                Panel Email{" "}
                <span className="text-primary">(login ke liye)</span>
              </label>
              <input
                type="email"
                placeholder="user@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                className="w-full bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
              />
            </div>
            <div>
              <label className="page-eyebrow block mb-1">
                Panel Password{" "}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="User can also set this via /reset_password"
                value={form.panelPassword}
                onChange={(e) =>
                  setForm((f) => ({ ...f, panelPassword: e.target.value }))
                }
                className="w-full bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-11 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
              >
                {submitting ? "Adding..." : "Activate"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 h-11 border border-input rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary active:bg-muted transition-all bg-card"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Total Users",
            value: subs.length,
            icon: Users,
            color: "text-foreground",
          },
          {
            label: "Active",
            value: activeSubs.length,
            icon: CheckCircle,
            color: "text-success",
          },
          {
            label: "Expired",
            value: expiredSubs.length,
            icon: XCircle,
            color: "text-destructive",
          },
          {
            label: "Expiring Soon",
            value: activeSubs.filter(
              (s) => s.daysLeft !== null && s.daysLeft <= 3
            ).length,
            icon: Clock,
            color: "text-warning",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card p-4 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color}`} />
            <div className="min-w-0">
              <div className={`font-mono text-2xl font-bold ${color}`}>
                {value}
              </div>
              <div className="page-eyebrow mt-0.5">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat-card h-16 animate-pulse" />
          ))}
        </div>
      ) : subs.length === 0 ? (
        <div className="stat-card flex flex-col items-center justify-center border-dashed py-24 px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Crown className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground mb-1">
            No subscriptions yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Click "Add User" to grant access.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((sub) => {
            const isExpired = sub.status === "expired";
            const expiringSoon = sub.daysLeft !== null && sub.daysLeft <= 3;
            const statusClass = isExpired
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success";
            const dotClass = isExpired ? "bg-destructive" : "bg-success";

            return (
              <div key={sub.telegramId} className="stat-card p-4">
                {/* Header: identity + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="bg-muted rounded-xl p-2.5 shrink-0">
                      <Crown className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="page-eyebrow">User</div>
                      <div className="font-display font-semibold text-sm truncate">
                        @{sub.username || "—"}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 bg-primary/10 text-primary`}
                  >
                    {sub.planMeta?.id || getPlan(sub.plan).id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${statusClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                    {isExpired ? "Expired" : "Active"}
                  </span>
                </div>

                {/* Data grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div className="flex flex-col min-w-0">
                    <span className="page-eyebrow">Telegram ID</span>
                    <button
                      onClick={() => copyId(sub.telegramId)}
                      className="flex items-center gap-1 font-mono text-xs text-foreground hover:text-primary active:bg-muted px-1.5 py-1 -ml-1.5 rounded-lg transition-colors text-left min-w-0"
                    >
                      <span className="truncate">{sub.telegramId}</span>
                      <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  </div>
                  <div className="flex flex-col">
                    <span className="page-eyebrow">Plan</span>
                    <span className="font-mono text-xs text-foreground px-1.5 py-1">
                      {sub.plan}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="page-eyebrow">Expires</span>
                    <span className="font-mono text-xs text-muted-foreground px-1.5 py-1">
                      {formatDate(sub.expiresAt)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="page-eyebrow">Days Left</span>
                    <span className="px-1.5 py-1">
                      {sub.daysLeft === null ? (
                        <span className="font-mono text-sm font-semibold text-primary">
                          ∞
                        </span>
                      ) : expiringSoon ? (
                        <span className="font-mono text-sm font-semibold text-warning">
                          {sub.daysLeft}d
                        </span>
                      ) : (
                        <span className="font-mono text-sm text-muted-foreground">
                          {sub.daysLeft}d
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div className="flex justify-end pt-3 border-t border-card-border">
                  <button
                    onClick={() => handleDelete(sub.telegramId, sub.username)}
                    disabled={deleting === sub.telegramId}
                    className="flex items-center justify-center gap-1.5 px-4 h-11 text-xs font-semibold text-destructive border border-destructive/30 rounded-full hover:bg-destructive/10 disabled:opacity-50 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    {deleting === sub.telegramId ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 stat-card p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-muted border border-card-border flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-primary text-xs font-bold">TG</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Telegram Bot Active
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Users can interact via the bot. Commands: /start · /apk ·
            /reset_password
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Admin commands: /adduser {"{"}telegramId{"}"} {"{"}days{"}"} {"{"}
            username{"}"} · /removeuser · /listusers · /stats
          </p>
        </div>
      </div>
    </Layout>
  );
}
