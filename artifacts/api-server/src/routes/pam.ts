import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const router = Router();
const PAM_PY = path.resolve("/opt/parivahan/pam.py");
const TOOL_PY = path.resolve("/opt/parivahan/tool.py");

// GET /api/pam/status — checks pam.py/tool.py presence + running bot
router.get("/pam/status", requireAuth, async (_req,res)=>{
  const hasPam = fs.existsSync(PAM_PY);
  const hasTool = fs.existsSync(TOOL_PY);
  exec("systemctl is-active parivahan-api 2>&1 | tr -d '\\n'", (e, apiStatus)=>{
    exec("pm2 jlist 2>&1 | head -c 2000", (e2, pm2)=>{
      res.json({ ok: true, hasPam, hasTool, pamPath: PAM_PY, toolPath: TOOL_PY, apiStatus: (apiStatus||"").trim(), pm2Snippet: (pm2||"").slice(0,1200) });
    });
  });
});

// POST /api/pam/exec — admin: run python snippet via pam context (bounded)
router.post("/pam/exec", requireAdmin, async (req,res)=>{
  const { cmd } = req.body||{};
  if(!cmd || typeof cmd !== "string" || cmd.length>2000) return res.status(400).json({error:"cmd string 1..2000 required"});
  const allow = ["python3","pip","ls","cat","head"];
  const first = cmd.trim().split(/\s+/)[0];
  if(!allow.includes(first)) return res.status(403).json({error:"only "+allow.join(",")+" allowed"});
  exec(cmd, {timeout: 30000, cwd: "/opt/parivahan"}, (err, stdout, stderr)=>{
    res.json({ code: err?.code||0, stdout: stdout.slice(0,8000), stderr: stderr.slice(0,8000) });
  });
});

// GET /api/tool/file — return raw tool.py/pam.py meta (admin)
router.get("/tool/file", requireAdmin, async (req,res)=>{
  const which = String(req.query.which||"tool");
  const p = which==="pam" ? PAM_PY : TOOL_PY;
  if(!fs.existsSync(p)) return res.status(404).json({error:"not found: "+p});
  const stat = fs.statSync(p);
  res.json({ path: p, size: stat.size, mtime: stat.mtime, lines: fs.readFileSync(p,"utf8").split("\n").length });
});
export default router;
