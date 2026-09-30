import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middleware/auth.js";
import { buildAutoRouter } from "./autoRouter.js";

const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5177";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    callback(null, origin || true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-9r-cli-token"],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "128mb" }));
app.use(express.urlencoded({ extended: true, limit: "128mb" }));

// ─── Health Check (no auth) ────────────────────────────────────────────────────
async function getLocalKiroStatus() {
  const isWindows = process.platform === "win32";
  const result = {
    localOnly: isWindows,
    platform: process.platform,
    kiroInstalled: false,
    kiroRunning: false,
    kiroDnsActive: false,
    certExists: false,
    certTrusted: false,
    mitmPort443: false,
  };
  if (!isWindows) return result;

  try {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const child = await import("node:child_process");
    const dataDir = process.env.DATA_DIR ||
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router");
    const certPath = path.join(dataDir, "mitm", "rootCA.crt");
    result.certExists = fs.existsSync(certPath);

    const hostsPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "drivers", "etc", "hosts");
    const hosts = fs.existsSync(hostsPath) ? fs.readFileSync(hostsPath, "utf8") : "";
    result.kiroDnsActive =
      hosts.includes("q.us-east-1.amazonaws.com") &&
      hosts.includes("codewhisperer.us-east-1.amazonaws.com");

    const kiroPaths = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro.cmd"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Kiro", "Kiro.exe"),
    ];
    result.kiroInstalled = kiroPaths.some((p) => p && fs.existsSync(p));

    try {
      child.execFileSync("tasklist", ["/FI", "IMAGENAME eq Kiro.exe"], { stdio: "pipe", windowsHide: true });
      const taskText = child.execFileSync("tasklist", ["/FI", "IMAGENAME eq Kiro.exe", "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
      result.kiroRunning = /"Kiro\.exe"/i.test(taskText);
    } catch {}

    if (result.certExists) {
      try {
        child.execFileSync("certutil", ["-store", "Root", "9Router MITM Root CA"], { stdio: "pipe", windowsHide: true });
        result.certTrusted = true;
      } catch {}
    }

    await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 443 });
      socket.setTimeout(400);
      socket.once("connect", () => {
        result.mitmPort443 = true;
        socket.destroy();
        resolve();
      });
      socket.once("error", resolve);
      socket.once("timeout", () => { socket.destroy(); resolve(); });
    });
  } catch {}
  return result;
}

async function findKiroStartMenuShortcut() {
  if (process.platform !== "win32") return null;
  const fs = await import("node:fs");
  const roots = [
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.ProgramData || "", "Microsoft", "Windows", "Start Menu", "Programs"),
  ].filter((p) => p && fs.existsSync(p));

  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (/\.lnk$/i.test(entry.name) && /^kiro(?:\.ide)?\.lnk$/i.test(entry.name.replace(/\.lnk$/i, ".lnk"))) {
        return full;
      } else if (/^kiro/i.test(entry.name) && /\.lnk$/i.test(entry.name)) {
        return full;
      }
    }
    return null;
  };

  for (const root of roots) {
    const found = walk(root);
    if (found) return found;
  }
  return null;
}

app.post("/api/local/launch-kiro", async (req, res) => {
  const remote = req.ip?.replace("::ffff:", "");
  if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "localhost") {
    return res.status(403).json({ error: "Local Kiro launcher only" });
  }
  if (process.platform !== "win32") {
    return res.status(400).json({ error: "Kiro launcher is available on Windows only" });
  }

  try {
    const fs = await import("node:fs");
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro.cmd"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Kiro", "Kiro.exe"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Kiro.lnk"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Kiro", "Kiro.lnk"),
    ].filter(Boolean);
    const executable = candidates.find((p) => fs.existsSync(p)) || await findKiroStartMenuShortcut();
    if (!executable) {
      return res.status(404).json({
        error: "Aplikasi Kiro tidak ditemukan",
        candidates,
      });
    }

    const child = spawn(executable, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: executable.endsWith(".cmd"),
    });
    child.unref();

    return res.json({ success: true, launched: true, executable });
  } catch (error) {
    console.error("[local] failed to launch Kiro:", error);
    return res.status(500).json({ error: "Gagal menjalankan aplikasi Kiro" });
  }
});

app.get("/api/local/launch-kiro", async (req, res) => {
  const remote = req.ip?.replace("::ffff:", "");
  if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "localhost") {
    return res.status(403).type("text").send("Local Kiro launcher only");
  }
  if (process.platform !== "win32") return res.status(400).type("text").send("Kiro launcher is available on Windows only");
  try {
    const fs = await import("node:fs");
    const candidates = [
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro.cmd"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Kiro", "bin", "kiro"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Kiro", "Kiro.exe"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Kiro.lnk"),
      path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Kiro", "Kiro.lnk"),
    ].filter(Boolean);
    const executable = candidates.find((p) => fs.existsSync(p)) || await findKiroStartMenuShortcut();
    if (!executable) return res.status(404).type("text").send("Aplikasi Kiro tidak ditemukan");
    if (executable.toLowerCase().endsWith(".lnk")) {
      const child = spawn("cmd.exe", ["/c", "start", "", executable], { detached: true, stdio: "ignore", windowsHide: false });
      child.unref();
    } else {
      const child = spawn(executable, [], { detached: true, stdio: "ignore", windowsHide: false, shell: executable.endsWith(".cmd") });
      child.unref();
    }
    return res.type("html").send("<!doctype html><title>Kiro</title><body style='font-family:system-ui;padding:32px'><h2>Kiro sedang dijalankan</h2><p>Tab ini boleh ditutup.</p></body>");
  } catch (error) {
    console.error("[local] GET failed to launch Kiro:", error);
    return res.status(500).type("text").send("Gagal menjalankan Kiro");
  }
});

app.get("/api/health", async (_req, res) => {
  res.json({
    status: "ok",
    version: "3.0.0",
    ts: Date.now(),
    kiroBridge: await getLocalKiroStatus(),
  });
});

// ─── Auth Middleware ───────────────────────────────────────────────────────────
// Authentication only applies to API/proxy traffic. Applying it globally would
// prevent the login page and SPA assets from loading when login is required.
app.use((req, res, next) => {
  if (
    req.path === "/api" ||
    req.path.startsWith("/api/") ||
    req.path === "/v1" ||
    req.path.startsWith("/v1/") ||
    req.path === "/v1beta" ||
    req.path.startsWith("/v1beta/")
  ) {
    return authMiddleware(req, res, next);
  }
  return next();
});

// ─── Auto-mount all routes ────────────────────────────────────────────────────
async function start() {
  const apiRouter = await buildAutoRouter();
  app.use("/api", (req, res, next) => {
    console.log("API request:", req.method, req.url, req.originalUrl);
    apiRouter(req, res, next);
  });

  // LLM proxy remaps: /v1/* → /api/v1/*
  app.use("/v1", (req, res, next) => {
    req.url = "/v1" + req.url;
    apiRouter(req, res, next);
  });
  app.use("/v1beta", (req, res, next) => {
    req.url = "/v1beta" + req.url;
    apiRouter(req, res, next);
  });

  app.use(["/api", "/v1", "/v1beta"], (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve the production SPA from the same origin as the API.
  app.use(express.static(FRONTEND_DIST, { index: false, redirect: false }));
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
      return res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    }
    return next();
  });

  // ─── 404 Fallback ──────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // ─── Error Handler ─────────────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[server] unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 9Router V3 Backend running on http://localhost:${PORT}`);
    console.log(`   Frontend origin: ${FRONTEND_ORIGIN}`);
    console.log(`   Environment: ${process.env.NODE_ENV || "development"}\n`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app };
