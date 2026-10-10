import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import multer from "multer";
import fs from "fs";
import net from "net";

// Load environment variables from project root .env.local
const moduleDir = typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(moduleDir, "../../.env.local");
const result = config({ path: envPath });
if (result.error) {
  console.warn("[env] failed to load .env.local:", result.error.message);
} else {
  console.log("[env] loaded from", envPath);
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "crypto";
import { getRequestListener } from "@hono/node-server";
import { authMiddleware } from "./middleware/auth.js";
import { oauthApp } from "./routes/twenty/oauth/index.js";
import { loadOAuthConfig } from "./lib/twenty/oauth/index.js";
import authRoutes from "./routes/auth/index.js";
import leadsRoutes from "./routes/leads/index.js";
import prospectsRoutes from "./routes/prospects/index.js";
import campaignsRoutes from "./routes/campaigns/index.js";
import scriptsRoutes from "./routes/scripts/index.js";
import twentyPhonesRoutes from "./routes/twenty/phones/index.js";
import twentyMetaRoutes from "./routes/twenty/meta/index.js";
import twentySetupRoutes from "./routes/twenty/setup/index.js";
import callCampaignRoutes from "./routes/callCampaigns/index.js";
import audioSessionRoutes from "./routes/audioSessions/index.js";
import twentyWebhookRouter from "./routes/twenty/webhook/index.js";
import { callLogsRouter } from "./routes/call-logs/index.js";
import callsRouter from "./routes/calls/index.js";
import webhooksRouter from "./routes/telnyx/webhook/index.js";
import { profilesRouter } from "./routes/profiles/index.js";
import notifyRouter from "./routes/notify/index.js";
import { createLogger } from "./lib/logger/index.js";
import { clientIp } from "./lib/client-ip/index.js";

const log = createLogger('server');
const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Ensure recordings directory exists. On read-only filesystems (Vercel
// functions) this mkdir fails — warn and continue so a storage problem can
// never take the whole API down at import time. Upload/serve endpoints
// degrade to their own 500/404 in that case.
const RECORDINGS_DIR = path.join(process.cwd(), "data", "recordings");
try {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
} catch (err: any) {
  log.warn(`recordings dir not writable (${RECORDINGS_DIR}): ${err.message}`);
}

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

app.use(helmet());

// CORS allowlist: the deployed frontend origin plus local dev servers.
// Reflecting arbitrary origins with credentials would let any hijacked
// site call authenticated APIs.
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "",
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Origin not allowed"));
    }
  },
  credentials: true,
}));

// Disallowed origins get a clean 403 JSON instead of Express's default
// 500 HTML error page. Scoped to the CORS origin error only — every other
// error delegates to the default handler unchanged.
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.message === "Origin not allowed") {
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  next(err);
});

// Abuse tiers: general API traffic, sensitive auth/upload paths, and the
// unauthenticated network probe each get their own budget.
// Keyed on the real client (see clientIp): keyed on req.ip, every user behind
// Cloudflare/Vercel shared one bucket and sign-in failed for all of them.
const limiterKey = { keyGenerator: clientIp, validate: { xForwardedForHeader: false } };
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, ...limiterKey });
const sensitiveLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, ...limiterKey });
const probeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ...limiterKey });
app.use("/api/", generalLimiter);

// Hono owns /api/oauth (Twenty PKCE). Mounted before express.json() — the
// node-server listener reads the raw request stream, which body parsing
// would otherwise consume first.
app.use("/api/oauth", getRequestListener(oauthApp.fetch));

app.use(express.json({
  limit: "10mb",
  // Keep the raw bytes so HMAC-signed webhooks (Twenty) can validate
  // against the exact payload: {timestamp}:{raw JSON body}.
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

app.get("/api/health", (_req, res) => {
  const oauth = loadOAuthConfig();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    twentyCrm: {
      apiKeyConfigured: Boolean(process.env.TWENTY_API_KEY),
      oauthConfigured: Boolean(oauth),
      oauthMessage: oauth
        ? "Twenty OAuth PKCE is configured"
        : "Set TWENTY_OAUTH_CLIENT_ID, TWENTY_OAUTH_CLIENT_SECRET and TWENTY_OAUTH_REDIRECT_URI — password login was removed.",
    },
  });
});

// Pre-flight SIP reachability probe for the Softphone. Host allowlist is
// deliberately narrow — this must not become an open port scanner.
const NETCHECK_ALLOW = new Map<string, number[]>([
  ["sip.telnyx.com", [443, 5061, 7443, 8443]],
  ["rtc.telnyx.com", [443]],
]);

app.get("/api/netcheck", probeLimiter, (req, res) => {
  const host = String(req.query.host || "");
  const port = Number(req.query.port || 0);
  const allowed = NETCHECK_ALLOW.get(host) || [];
  if (!allowed.includes(port)) {
    res.status(400).json({ ok: false, error: "Host/port not in probe allowlist" });
    return;
  }
  const started = Date.now();
  const socket = net.connect(port, host);
  const done = (ok: boolean, error?: string) => {
    try { socket.destroy(); } catch { /* already closed */ }
    res.json({ ok, ms: Date.now() - started, host, port, ...(error ? { error } : {}) });
  };
  socket.setTimeout(8000);
  socket.once("connect", () => done(true));
  socket.once("timeout", () => done(false, "connect timed out after 8s"));
  socket.once("error", (err: any) => done(false, err?.message || "connect failed"));
});

app.use("/api/auth", sensitiveLimiter, authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/prospects", prospectsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/scripts", scriptsRoutes);
app.use("/api/twenty/phones", twentyPhonesRoutes);
app.use("/api/twenty/meta", twentyMetaRoutes);
app.use("/api/twenty/webhook", twentyWebhookRouter);
app.use("/api/setup/twenty", twentySetupRoutes);
app.use("/api/call-campaigns", callCampaignRoutes);
app.use("/api/audio-sessions", audioSessionRoutes);
app.use("/api/call-logs", callLogsRouter);
app.use("/api/calls", callsRouter);
// Telnyx webhooks are token-gated (no authMiddleware) — mount alongside,
// before or after auth routes doesn't matter since the router is public.
// NOTE: the Twenty CRM webhook lives at /api/twenty/webhook (HMAC); this is
// the Telnyx telephony webhook. Different senders, different auth.
app.use("/api/webhooks", webhooksRouter);
// Legacy alias: the Telnyx Call Control app still posts to /api/telnyx-webhook
// (the standalone-function path from before the Vercel services deploy).
// Same router, same token gate — keeps webhook delivery working without
// needing Telnyx dashboard access to repoint the URL.
app.use("/api/telnyx-webhook", webhooksRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/notify", notifyRouter);

/**
 * POST /api/calls/recording
 * Accept and store call recording uploads (authenticated agents only)
 */
app.post("/api/calls/recording", authMiddleware, sensitiveLimiter, upload.single("recording"), async (req, res) => {
  try {
    const file = (req as any).file;
    const { leadId, callId } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No recording file provided" });
    }

    // Audio extension allowlist (in addition to the multer mimetype check):
    // the extension comes from the uploader and must not be trusted blindly.
    const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".webm"]);
    const extension = path.extname(file.originalname).toLowerCase() || ".webm";
    if (!AUDIO_EXTENSIONS.has(extension)) {
      return res.status(400).json({ error: "Unsupported audio format" });
    }

    // Unpredictable uuid filename (timestamp names are enumerable/guessable).
    const filename = `${randomUUID()}${extension}`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    // Save file
    fs.writeFileSync(filePath, file.buffer);

    // Generate URL for accessing the recording
    const recordingUrl = `/api/calls/recordings/${filename}`;

    log.info(`Recording uploaded: ${filename} (${file.size} bytes) for lead: ${leadId}, call: ${callId}`);

    res.json({
      success: true,
      recordingUrl,
      filename,
      size: file.size,
    });
  } catch (err: any) {
    log.error("Failed to upload recording:", err.message);
    res.status(500).json({ error: "Failed to upload recording", details: err.message });
  }
});

/**
 * GET /api/calls/recordings/:filename
 * Serve stored recordings (authenticated agents only)
 */
app.get("/api/calls/recordings/:filename", authMiddleware, (req, res) => {
  const filename = String(req.params.filename || "");
  // Containment: reject traversal/absolute segments and anything outside
  // the recordings directory before touching the filesystem.
  if (
    !filename ||
    filename !== path.basename(filename) ||
    !path.resolve(RECORDINGS_DIR, filename).startsWith(path.resolve(RECORDINGS_DIR) + path.sep)
  ) {
    return res.status(400).json({ error: "Invalid recording filename" });
  }
  const filePath = path.join(RECORDINGS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Recording not found" });
  }

  res.sendFile(filePath);
});

// Identity comes from Twenty OAuth now — no Postgres credential check.
log.info(`Server running on http://localhost:${PORT}`);
app.listen(PORT, "0.0.0.0", () => {
  log.info(`Server ready on port ${PORT}`);
});
