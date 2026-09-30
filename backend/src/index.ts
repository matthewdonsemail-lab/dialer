import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import multer from "multer";
import fs from "fs";
import net from "net";

// Load environment variables from project root .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env.local");
const result = config({ path: envPath });
if (result.error) {
  console.warn("[env] failed to load .env.local:", result.error.message);
} else {
  console.log("[env] loaded from", envPath);
}

import express from "express";
import cors from "cors";
import { getRequestListener } from "@hono/node-server";
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
import { callLogsRouter } from "./routes/call-logs/index.js";
import callsRouter from "./routes/calls/index.js";
import webhooksRouter from "./routes/webhooks/index.js";
import { profilesRouter } from "./routes/profiles/index.js";
import { createLogger } from "./lib/logger.js";

const log = createLogger('server');
const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// Ensure recordings directory exists
const RECORDINGS_DIR = path.join(process.cwd(), "data", "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
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

app.use(cors({ origin: true, credentials: true }));

// Hono owns /api/oauth (Twenty PKCE). Mounted before express.json() — the
// node-server listener reads the raw request stream, which body parsing
// would otherwise consume first.
app.use("/api/oauth", getRequestListener(oauthApp.fetch));

app.use(express.json({ limit: "10mb" }));

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

app.get("/api/netcheck", (req, res) => {
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

app.use("/api/auth", authRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/prospects", prospectsRoutes);
app.use("/api/campaigns", campaignsRoutes);
app.use("/api/scripts", scriptsRoutes);
app.use("/api/twenty/phones", twentyPhonesRoutes);
app.use("/api/twenty/meta", twentyMetaRoutes);
app.use("/api/setup/twenty", twentySetupRoutes);
app.use("/api/call-logs", callLogsRouter);
app.use("/api/calls", callsRouter);
// Telnyx webhooks are token-gated (no authMiddleware) — mount alongside,
// before or after auth routes doesn't matter since the router is public.
app.use("/api/webhooks", webhooksRouter);
app.use("/api/profiles", profilesRouter);

/**
 * POST /api/calls/recording
 * Accept and store call recording uploads
 */
app.post("/api/calls/recording", upload.single("recording"), async (req, res) => {
  try {
    const file = req.file;
    const { leadId, callId } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No recording file provided" });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(file.originalname) || ".webm";
    const filename = `${timestamp}-${timestamp}-${extension}`;
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
 * Serve stored recordings
 */
app.get("/api/calls/recordings/:filename", (req, res) => {
  const filename = req.params.filename;
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
