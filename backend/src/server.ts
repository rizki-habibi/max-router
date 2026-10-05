import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middleware/auth.js";
import { buildAutoRouter } from "./autoRouter.js";
import { resumeModelTestJobs } from "./lib/modelTestWorker.js";

const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5177";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

const app = express();
// Railway berada di belakang reverse proxy. Percayai satu hop agar Express
// membaca protokol/host asli dengan benar untuk cookie dan redirect.
app.set("trust proxy", 1);

// Lightweight in-process diagnostics. Never store request bodies, tokens, cookies,
// API keys, or other credentials here. These entries are intentionally bounded.
type RuntimeError = { timestamp: string; type: string; message: string; stack?: string };
const runtimeErrors: RuntimeError[] = [];
let startupReady = false;
const pushRuntimeError = (type: string, error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  runtimeErrors.push({
    timestamp: new Date().toISOString(),
    type,
    message: err.message,
    stack: err.stack,
  });
  if (runtimeErrors.length > 50) runtimeErrors.shift();
};

process.on("unhandledRejection", (reason) => {
  pushRuntimeError("unhandledRejection", reason);
  console.error("[runtime] unhandledRejection:", reason);
});
process.on("uncaughtException", (error) => {
  pushRuntimeError("uncaughtException", error);
  console.error("[runtime] uncaughtException:", error);
  process.exit(1);
});

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
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: startupReady ? "ok" : "starting",
    ready: startupReady,
    version: "3.0.0",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Safe public diagnostics: useful for Railway/container troubleshooting without
// exposing secrets or environment variable values.
app.get("/api/diagnostics", (_req, res) => {
  const memory = process.memoryUsage();
  res.status(200).json({
    status: "ok",
    service: process.env.RAILWAY_SERVICE_NAME || "max-router",
    environment: process.env.NODE_ENV || "development",
    node: process.version,
    platform: process.platform,
    hostname: os.hostname(),
    pid: process.pid,
    port: PORT,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    ready: startupReady,
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
    },
    recentErrors: runtimeErrors.slice(-20),
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
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("\n[server] 9Router V3 Backend listening on 0.0.0.0:" + PORT);
    console.log("   Frontend origin: " + FRONTEND_ORIGIN);
    console.log("   Environment: " + (process.env.NODE_ENV || "development"));
  });

  let apiRouter;
  try {
    apiRouter = await buildAutoRouter();
  } catch (err) {
    pushRuntimeError("startup", err);
    console.error("[startup] Route graph failed; shutting down so the deployment cannot report a false healthy state.");
    console.error(err);
    server.close(() => process.exit(1));
    return server;
  }

  startupReady = true;
  console.log("[startup] Route graph ready.");
  resumeModelTestJobs().catch((err) => console.error("[model-test-worker] startup resume gagal:", err));
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
    pushRuntimeError("request", err);
    console.error("[server] unhandled error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

}

start().catch((err) => {
  pushRuntimeError("startup", err);
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app };
