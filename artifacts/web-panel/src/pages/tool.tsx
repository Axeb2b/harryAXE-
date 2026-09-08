import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { authHeaders } from "@/lib/apiFetch";
import {
  Shield,
  Send,
  KeyRound,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
async function api(path: string, body: any) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}) as any);
  if (!res.ok) throw new Error((j as any).error || `HTTP ${res.status}`);
  return j;
}
export function Tool() {
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("MR");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [downOtp, setDownOtp] = useState("");
  const initiate = async () => {
    setLoading(true);
    setMsg(null);
    try {
      if (!/^[6-9]\d{9}$/.test(mobile))
        throw new Error("Enter valid 10-digit mobile");
      const j = await api("/tool/aadhaar/initiate", { mobile, name });
      setSessionId((j as any).session_id || (j as any).sessionId || "");
      setMsg({ type: "success", text: (j as any).message || "OTP sent" });
      setStep(2);
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };
  const verify = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const j = await api("/tool/aadhaar/verify", {
        session_id: sessionId,
        otp,
      });
      setMsg({ type: "success", text: (j as any).message || "Verified" });
      setStep(3);
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };
  const sendDownloadOtp = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const j = await api("/tool/aadhaar/send-download-otp", {
        session_id: sessionId,
      });
      setMsg({
        type: "success",
        text: (j as any).message || "Download OTP sent",
      });
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };
  const download = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const j = await api("/tool/aadhaar/download", {
        session_id: sessionId,
        otp: downOtp,
      });
      if ((j as any).pdfBase64) {
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${(j as any).pdfBase64}`;
        a.download = `aadhaar_${mobile}.pdf`;
        a.click();
        setMsg({ type: "success", text: "PDF downloaded" });
      } else setMsg({ type: "info", text: JSON.stringify(j).slice(0, 400) });
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6466f1] to-[#00c2ff] flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Aadhaar Tool</h1>
            <p className="text-sm text-muted-foreground">
              tool.py — honeybadger proxy
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            tool.py
          </Badge>
        </div>
        {msg && (
          <Alert variant={msg.type === "error" ? "destructive" : undefined}>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{msg.text}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[#6466f1]" />
                Step {step} —{" "}
                {step === 1 ? "Initiate" : step === 2 ? "Verify" : "Download"}
              </CardTitle>
              <CardDescription>
                Mobile-first, focus-visible, responsive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile</Label>
                    <Input
                      id="mobile"
                      inputMode="numeric"
                      placeholder="98xxxxxx10"
                      value={mobile}
                      onChange={(e) =>
                        setMobile(
                          e.target.value.replace(/\D/g, "").slice(0, 10)
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      placeholder="MR"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={initiate}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Send OTP
                  </Button>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>OTP</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="6-digit"
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={verify}
                      disabled={loading}
                      className="flex-1"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      Verify
                    </Button>
                    <Button variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-4">
                  <Button
                    onClick={sendDownloadOtp}
                    disabled={loading}
                    variant="secondary"
                    className="w-full"
                  >
                    Resend Download OTP
                  </Button>
                  <div className="space-y-2">
                    <Label>Download OTP</Label>
                    <Input
                      inputMode="numeric"
                      value={downOtp}
                      onChange={(e) =>
                        setDownOtp(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                    />
                  </div>
                  <Button
                    onClick={download}
                    disabled={loading}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setStep(1);
                      setOtp("");
                      setDownOtp("");
                    }}
                    className="w-full"
                  >
                    Start Over
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {loading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Step</span>
                      <Badge>{step}/3</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Session</span>
                      <span className="font-mono text-xs truncate max-w-[150px]">
                        {sessionId ? sessionId.slice(0, 12) + "…" : "—"}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
