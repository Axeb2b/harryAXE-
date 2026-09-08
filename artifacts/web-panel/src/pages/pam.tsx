import { useState, useEffect } from "react";
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
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { authHeaders } from "@/lib/apiFetch";
import {
  ShieldCheck,
  Terminal,
  Activity,
  FileCode2,
  Loader2,
  Play,
} from "lucide-react";
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export function Pam() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [cmd, setCmd] = useState("python3 --version");
  const [execRes, setExecRes] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pam/status`, {
        headers: { ...authHeaders() },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "status failed");
      setStatus(j);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchStatus();
  }, []);
  const execCmd = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/pam/exec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ cmd }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "exec failed");
      setExecRes(j);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">PAM Control</h1>
            <p className="text-sm text-muted-foreground">
              pam.py — Telegram + Selenium fleet (admin)
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            pam.py
          </Badge>
        </div>
        {msg && (
          <Alert variant="destructive">
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass-card border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                Fleet Status
              </CardTitle>
              <CardDescription>
                Checks presence of pam.py/tool.py and API health (requireAuth).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={fetchStatus} disabled={loading} size="sm">
                <Activity className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              {loading && !status ? (
                <Skeleton className="h-32 w-full" />
              ) : status ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">hasPam</span>
                    <Badge variant={status.hasPam ? "default" : "destructive"}>
                      {String(status.hasPam)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">hasTool</span>
                    <Badge variant={status.hasTool ? "default" : "destructive"}>
                      {String(status.hasTool)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">apiStatus</span>
                    <span className="font-mono text-xs">
                      {status.apiStatus}
                    </span>
                  </div>
                  <pre className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs overflow-auto max-h-32">
                    {JSON.stringify(status, null, 2).slice(0, 2000)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No data. Click Refresh.
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Admin Exec (bounded)
              </CardTitle>
              <CardDescription>
                Allowlist: python3, pip, ls, cat, head — 30s timeout, admin
                only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Command</Label>
                <Input
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  placeholder="python3 --version"
                  className="font-mono"
                />
              </div>
              <Button onClick={execCmd} disabled={loading} className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Execute
              </Button>
              {execRes && (
                <pre className="bg-black/50 border border-white/10 rounded-lg p-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(execRes, null, 2).slice(0, 8000)}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4" />
              Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono">tool.py</TableCell>
                  <TableCell>4.8K</TableCell>
                  <TableCell>122</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono">pam.py</TableCell>
                  <TableCell>41K</TableCell>
                  <TableCell>781</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
