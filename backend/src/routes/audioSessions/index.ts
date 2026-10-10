import { Router } from "express";
import { authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { createLogger } from "../../lib/logger/index.js";
import { telnyxErrorMessage } from "../../lib/telnyx/index.js";
import { audioSessionStore } from "../../lib/twenty/audioSession/index.js";
import { bridgeConfig, telnyxBridgeCalls } from "../../lib/audioBridge/telnyx.js";
import { SESSION_TTL_MS, digitsOnly, generatePin, isExpired, isLive, type AudioSession } from "../../lib/audioBridge/index.js";

/**
 * Phone audio for the dialer (Settings -> Audio Source: "Call me" / "Dial in").
 * The browser starts a session, polls it, and asks the backend to dial each
 * contact into it; Telnyx webhooks (routes/telnyx/webhook) move its state.
 */
const router = Router();
router.use(authMiddleware);
const log = createLogger("audio-sessions");

const E164 = /^\+[1-9]\d{6,14}$/;

/** What the browser may see: no other operators' PINs, nothing internal. */
function view(s: AudioSession) {
  const { dialInNumber } = bridgeConfig();
  return {
    id: s.id,
    mode: s.mode,
    status: isExpired(s, new Date()) && s.status !== "ended" ? "ended" : s.status,
    agentPhone: s.agentPhone,
    dialInNumber: s.mode === "dial_in" ? dialInNumber || null : null,
    pin: s.mode === "dial_in" && s.status === "waiting_dial_in" ? s.pin : null,
    contactLegId: s.contactLegId,
    contactState: s.contactState,
    contactAnsweredAt: s.contactAnsweredAt,
    contactEndedAt: s.contactEndedAt,
    hangupCause: s.hangupCause,
    error: s.error,
  };
}

async function ownSession(req: AuthRequest, res: any): Promise<AudioSession | null> {
  const sessions = await audioSessionStore.list();
  const s = sessions.find((x) => x.id === req.params.id);
  if (!s || s.memberId !== (req.workspaceMemberId ?? "")) {
    res.status(404).json({ error: "Audio session not found." });
    return null;
  }
  return s;
}

/** GET /api/audio-sessions/config - which phone options this deployment supports. */
router.get("/config", (_req, res) => {
  const { appId, dialInNumber } = bridgeConfig();
  res.json({
    callMeAvailable: !!appId,
    dialInAvailable: !!appId && !!dialInNumber,
    dialInNumber: dialInNumber || null,
    missing: [!appId && "TELNYX_CALL_CONTROL_APP_ID", !dialInNumber && "TELNYX_DIAL_IN_NUMBER"].filter(Boolean),
  });
});

/** POST /api/audio-sessions { mode, agentPhone?, from } - open your phone line. */
router.post("/", async (req: AuthRequest, res) => {
  const memberId = req.workspaceMemberId ?? "";
  const mode = req.body?.mode === "dial_in" ? "dial_in" : req.body?.mode === "call_me" ? "call_me" : null;
  const from = String(req.body?.from ?? "").trim();
  const agentPhone = String(req.body?.agentPhone ?? "").trim();
  const { appId, dialInNumber } = bridgeConfig();

  if (!memberId) return void res.status(401).json({ error: "Sign in again to use phone audio." });
  if (!mode) return void res.status(400).json({ error: "mode must be call_me or dial_in." });
  if (!appId) return void res.status(503).json({ error: "Phone audio is not configured (TELNYX_CALL_CONTROL_APP_ID)." });
  if (mode === "dial_in" && !dialInNumber) return void res.status(503).json({ error: "Dial in is not configured (TELNYX_DIAL_IN_NUMBER)." });
  if (mode === "call_me" && !E164.test(agentPhone)) return void res.status(400).json({ error: "Enter your phone number in international format, e.g. +15551234567." });
  if (mode === "call_me" && !E164.test(from)) return void res.status(400).json({ error: "No sending number to call you from." });

  try {
    const now = new Date();
    const sessions = await audioSessionStore.list();
    // One line per operator: close any earlier session first.
    for (const old of sessions.filter((s) => s.memberId === memberId && isLive(s, now))) {
      if (old.agentLegId) await telnyxBridgeCalls.hangup(old.agentLegId).catch(() => {});
      await audioSessionStore.update(old.id, { status: "ended" });
    }
    const pin = mode === "dial_in" ? generatePin(new Set(sessions.filter((s) => isLive(s, now) && s.pin).map((s) => s.pin as string))) : null;
    const created = await audioSessionStore.create({
      mode,
      status: mode === "dial_in" ? "waiting_dial_in" : "calling_agent",
      memberId,
      agentPhone: mode === "call_me" ? agentPhone : null,
      pin,
      contactState: "idle",
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    });
    if (mode === "call_me") {
      try {
        const agentLegId = await telnyxBridgeCalls.dial({ to: agentPhone, from, state: { kind: "agent", sessionId: created.id }, timeoutSecs: 45 });
        await audioSessionStore.update(created.id, { agentLegId });
        created.agentLegId = agentLegId;
      } catch (err: any) {
        await audioSessionStore.update(created.id, { status: "failed", error: telnyxErrorMessage(err) });
        return void res.status(502).json({ error: `Could not call ${agentPhone}: ${telnyxErrorMessage(err)}` });
      }
    }
    res.status(201).json(view(created));
  } catch (err: any) {
    log.error(`open session failed: ${err?.message}`);
    res.status(502).json({ error: "Could not start phone audio.", details: err?.message });
  }
});

/** GET /api/audio-sessions/:id - polled by the browser while the line is open. */
router.get("/:id", async (req: AuthRequest, res) => {
  try {
    const s = await ownSession(req, res);
    if (s) res.json(view(s));
  } catch (err: any) {
    res.status(502).json({ error: "Could not read the audio session.", details: err?.message });
  }
});

/** POST /api/audio-sessions/:id/dial { to, from } - ring a contact into your line (recorded). */
router.post("/:id/dial", async (req: AuthRequest, res) => {
  const to = String(req.body?.to ?? "").trim();
  const from = String(req.body?.from ?? "").trim();
  if (!E164.test(`+${digitsOnly(to)}`) || !E164.test(from)) return void res.status(400).json({ error: "A valid contact number and sending number are required." });
  try {
    const s = await ownSession(req, res);
    if (!s) return;
    if (s.status !== "ready" || !s.agentLegId || isExpired(s, new Date())) {
      return void res.status(409).json({ error: "Your phone line is not connected." });
    }
    const contactLegId = await telnyxBridgeCalls.dial({
      to: to.startsWith("+") ? to : `+${digitsOnly(to)}`,
      from,
      state: { kind: "contact", sessionId: s.id },
      linkTo: s.agentLegId,
      record: true,
    });
    await audioSessionStore.update(s.id, {
      contactLegId,
      contactState: "dialing",
      contactAnsweredAt: null,
      contactEndedAt: null,
      hangupCause: null,
    });
    res.json({ contactLegId });
  } catch (err: any) {
    log.error(`dial failed: ${err?.message}`);
    res.status(502).json({ error: `Could not place the call: ${telnyxErrorMessage(err)}` });
  }
});

/** POST /api/audio-sessions/:id/hangup - end the current contact call; your line stays open. */
router.post("/:id/hangup", async (req: AuthRequest, res) => {
  try {
    const s = await ownSession(req, res);
    if (!s) return;
    if (s.contactLegId && s.contactState !== "ended" && s.contactState !== "idle") {
      await telnyxBridgeCalls.hangup(s.contactLegId).catch(() => {});
    }
    res.status(204).end();
  } catch (err: any) {
    res.status(502).json({ error: "Could not hang up.", details: err?.message });
  }
});

/** POST /api/audio-sessions/:id/end - hang up everything and close the line. */
router.post("/:id/end", async (req: AuthRequest, res) => {
  try {
    const s = await ownSession(req, res);
    if (!s) return;
    if (s.contactLegId && s.contactState !== "ended" && s.contactState !== "idle") await telnyxBridgeCalls.hangup(s.contactLegId).catch(() => {});
    if (s.agentLegId) await telnyxBridgeCalls.hangup(s.agentLegId).catch(() => {});
    await audioSessionStore.update(s.id, { status: "ended" });
    res.status(204).end();
  } catch (err: any) {
    res.status(502).json({ error: "Could not end phone audio.", details: err?.message });
  }
});

export default router;
