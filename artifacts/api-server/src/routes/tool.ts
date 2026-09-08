import { Router } from "express";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const API_BASE = "https://honeybadger-aadharapi.vercel.app";
const TIMEOUT_MS = 120000;

async function proxyAadhar(path: string, body: any, apiKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return { status: res.status, json: await res.json(), isJson: true };
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, isJson: false, ct };
}

// POST /api/tool/aadhaar/initiate  {mobile,name, apiKey}
router.post("/tool/aadhaar/initiate", requireAuth, async (req,res)=>{
  try{
    const {mobile,name,apiKey} = req.body||{};
    if(!mobile||!/^[6-9]\d{9}$/.test(String(mobile))) return res.status(400).json({error:"valid 10-digit mobile required"});
    const key = apiKey || process.env.BADGER_API_KEY || "Badger-Cartel-Free";
    const r = await proxyAadhar("/api/initiate", {mobile, name: name||"MR"}, key);
    res.status(r.status).json(r.json);
  }catch(e:any){ res.status(500).json({error:e.message||"initiate failed"}); }
});
router.post("/tool/aadhaar/verify", requireAuth, async (req,res)=>{
  try{
    const {session_id, otp, apiKey} = req.body||{};
    if(!session_id||!otp) return res.status(400).json({error:"session_id and otp required"});
    const key = apiKey || process.env.BADGER_API_KEY || "Badger-Cartel-Free";
    const r = await proxyAadhar("/api/verify", {session_id, otp}, key);
    res.status(r.status).json(r.json);
  }catch(e:any){ res.status(500).json({error:e.message}); }
});
router.post("/tool/aadhaar/send-download-otp", requireAuth, async (req,res)=>{
  try{
    const {session_id, apiKey} = req.body||{};
    if(!session_id) return res.status(400).json({error:"session_id required"});
    const key = apiKey || process.env.BADGER_API_KEY || "Badger-Cartel-Free";
    const r = await proxyAadhar("/api/send-download-otp", {session_id}, key);
    res.status(r.status).json(r.json);
  }catch(e:any){ res.status(500).json({error:e.message}); }
});
router.post("/tool/aadhaar/download", requireAuth, async (req,res)=>{
  try{
    const {session_id, otp, apiKey} = req.body||{};
    if(!session_id||!otp) return res.status(400).json({error:"session_id and otp required"});
    const key = apiKey || process.env.BADGER_API_KEY || "Badger-Cartel-Free";
    const r = await proxyAadhar("/api/download", {session_id, otp}, key);
    if(r.isJson){
      if(r.json.pdfBase64){ res.json(r.json); return; }
      res.status(r.status).json(r.json);
    } else {
      res.setHeader("Content-Type", r.ct || "application/pdf");
      res.status(r.status).send(r.buf);
    }
  }catch(e:any){ res.status(500).json({error:e.message}); }
});
router.get("/tool/status", requireAuth, async (_req,res)=>{ res.json({ ok:true, tool:"aadhaar", base: API_BASE, has_tool_py: true }); });
export default router;
