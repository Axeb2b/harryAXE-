import { useState } from "react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/apiFetch";
import {
  Search,
  Loader2,
  Copy,
  CheckCircle2,
  User,
  Phone,
  Hash,
  MapPin,
  Shield,
  Users,
  FileText,
  Database,
  Send,
} from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_URL ?? ""}/api/osint/search`;

interface Hit {
  name?: string | null;
  father_name?: string | null;
  mobile?: string | null;
  alternate_mobile?: string | null;
  aadhar?: string | null;
  circle?: string | null;
  address?: string | null;
  [k: string]: any;
}

function fmtAddress(addr?: string | null): string {
  if (!addr) return "—";
  if (addr.includes("!")) {
    return addr.split("!").filter(Boolean).join(", ");
  }
  return addr;
}

export function UserSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Hit[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      toast({
        title: "Error",
        description: "Enter a mobile or aadhar number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);
    setMessage("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ request: q }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      if (json.message) setMessage(json.message);
      if (Array.isArray(json.results)) {
        setResults(json.results);
      } else {
        setResults([]);
        setMessage(json.message || "No results");
      }
    } catch (err: any) {
      setError(err.message || "Search failed");
      toast({
        title: "Error",
        description: err.message || "Search failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!results?.length) return;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "name",
      "father_name",
      "mobile",
      "alternate_mobile",
      "aadhar",
      "circle",
      "address",
    ];
    const rows = results.map((r) =>
      header
        .map((h) => esc(h === "address" ? fmtAddress(r[h]) : r[h]))
        .join(",")
    );
    download(
      `osint-${query.trim() || "export"}.csv`,
      [header.join(","), ...rows].join("\n"),
      "text/csv;charset=utf-8"
    );
  };

  const exportJSON = () => {
    if (!results?.length) return;
    download(
      `osint-${query.trim() || "export"}.json`,
      JSON.stringify(results, null, 2),
      "application/json"
    );
  };

  const handleAutoScan = async () => {
    setLoading(true);
    setError("");
    setResults(null);
    setMessage("");
    try {
      const res = await fetch(`${API_URL.replace("/search", "/auto")}`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(
        json.message || `Scanned ${(json.scanned || []).length} number(s)`
      );
      setResults(Array.isArray(json.results) ? json.results : []);
    } catch (err: any) {
      setError(err.message || "Auto-scan failed");
      toast({
        title: "Error",
        description: err.message || "Auto-scan failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!results?.length) return;
    const lines = results
      .map(
        (r, i) =>
          `=== ${i + 1} ===\nNAME: ${r.name || "—"}\nFATHER: ${r.father_name || "—"}\nMOBILE: ${r.mobile || "—"}\nALT: ${r.alternate_mobile || "—"}\nAADHAR: ${r.aadhar || "—"}\nCIRCLE: ${r.circle || "—"}\nADDRESS: ${fmtAddress(r.address)}`
      )
      .join("\n\n");
    await copyText(lines, "all");
  };

  const sendToTelegram = async () => {
    if (!results?.length) return;
    const top = results.slice(0, 10);
    const lines = top.map(
      (r, i) =>
        `${i + 1}. ${r.name || "—"}\n` +
        `Father: ${r.father_name || "—"}\n` +
        `Mobile: ${r.mobile || "—"}${r.alternate_mobile ? ` (alt ${r.alternate_mobile})` : ""}\n` +
        `Aadhar: ${r.aadhar || "—"}\n` +
        `Circle: ${r.circle || "—"}\n` +
        `Address: ${fmtAddress(r.address)}`
    );
    const more = results.length > 10 ? `\n…+${results.length - 10} more` : "";
    const text = `🔍 *OSINT: ${query.trim()}* — ${results.length} result(s)\n\n${lines.join("\n\n")}${more}`;
    try {
      const res = await fetch(
        `${API_URL.replace("/search", "/telegram/send")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast({
        title: "Sent to Telegram",
        description: "Results delivered to admin DM",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Send failed",
        variant: "destructive",
      });
    }
  };

  const hitText = (r: Hit) =>
    `NAME: ${r.name || "—"}\nFATHER: ${r.father_name || "—"}\nMOBILE: ${r.mobile || "—"}\nALT: ${r.alternate_mobile || "—"}\nAADHAR: ${r.aadhar || "—"}\nCIRCLE: ${r.circle || "—"}\nADDRESS: ${fmtAddress(r.address)}`;

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-5">
        <div>
          <p className="page-eyebrow">OSINT</p>
          <h1 className="page-title flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Data Search
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Look up a mobile number or aadhar and get the records back
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Mobile (9876543210) or Aadhar (367319743039)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-card border border-card-border rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="flex items-center justify-center gap-2 px-6 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md shadow-primary/20"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAutoScan}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-card-border bg-card text-sm font-semibold text-foreground hover:border-primary hover:text-primary disabled:opacity-50 transition-all"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            Scan all devices
          </button>
          {results && results.length > 0 && (
            <>
              <button
                onClick={sendToTelegram}
                className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-card-border bg-card text-sm font-semibold text-muted-foreground hover:text-primary hover:border-primary transition-all"
              >
                <Send className="w-4 h-4" /> Telegram
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-card-border bg-card text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all"
              >
                <FileText className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={exportJSON}
                className="flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-card-border bg-card text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all"
              >
                <Database className="w-4 h-4" /> JSON
              </button>
            </>
          )}
        </div>
      </div>

      {message && !error && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <Users className="w-3.5 h-3.5" /> {message}
          </p>
          {results && results.length > 0 && (
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-card-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all bg-card"
            >
              {copied === "all" ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy all
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="glass-card p-6 text-center text-destructive text-sm font-medium mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass-card h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && results && results.length === 0 && !error && (
        <div className="glass-card p-10 text-center text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">Nothing found for “{query.trim()}”</p>
        </div>
      )}

      {!loading && results && results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => {
            const key = `${i}-${r.mobile || r.aadhar || ""}`;
            return (
              <div key={key} className="glass-card overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    {/* Name + badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                        <User className="w-3 h-3" /> {r.name || "Unknown"}
                      </span>
                      {r.circle && (
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
                          {r.circle}
                        </span>
                      )}
                      {r.aadhar && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono">
                          <Hash className="w-3 h-3" /> {r.aadhar}
                        </span>
                      )}
                    </div>

                    {/* Key fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-2">
                      {r.father_name && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Father:
                          </span>{" "}
                          {r.father_name}
                        </p>
                      )}
                      <p className="text-xs">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <Phone className="w-3 h-3 text-primary" />{" "}
                          {r.mobile || "—"}
                        </span>
                        {r.alternate_mobile && (
                          <span className="text-muted-foreground ml-2">
                            alt: {r.alternate_mobile}
                          </span>
                        )}
                      </p>
                    </div>

                    {r.address && (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed">
                        <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
                        <span className="break-words">
                          {fmtAddress(r.address)}
                        </span>
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => copyText(hitText(r), key)}
                    className="flex-shrink-0 p-2.5 rounded-xl border border-transparent hover:border-card-border text-muted-foreground hover:text-primary active:bg-muted transition-all"
                    title="Copy record"
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
      )}
    </Layout>
  );
}
