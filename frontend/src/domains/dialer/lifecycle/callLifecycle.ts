import { api, getAuthToken } from "@/domains/api/client";
import { mapOutcomeToCallStatus } from "@/domains/calls/disposition";
import { getReport, getSipConfig, sipLog, type ClassifiedFailure } from "@/domains/dialer/sip";

/**
 * Everything one call does against Twenty, outside React: the number claim,
 * the agencyCalls row, Telnyx server recording and the final write. One
 * instance per call, so nothing from a previous call can leak into the next.
 *
 * Moved out of the old Softphone without behaviour changes:
 *   claim -> POST /api/calls (IN_PROGRESS) before the INVITE,
 *   X-Telnyx-Call-Control-ID -> /record,
 *   claim heartbeat while the call is live,
 *   pagehide keepalive flush when the tab closes mid-call.
 */

export interface CallMember {
  id: string;
  email: string;
}

export interface CallContext {
  direction: "outbound" | "inbound";
  /** Our number (caller ID). */
  fromNumber: string;
  /** The contact's number. */
  toNumber: string;
  phoneId: string | null;
  member: CallMember | null;
  prospectId: string | null;
  leadId: string | null;
  /** Explicit ?simulate=1: never touches Twenty or Telnyx. */
  simulated: boolean;
}

export class CallLifecycle {
  readonly ctx: CallContext;
  readonly startedAt = new Date().toISOString();
  /** Held number claim, released exactly once. */
  hold: { phoneId: string; memberId: string } | null = null;
  callId: string | null = null;
  telnyxCallControlId: string | null = null;
  lastFailure: ClassifiedFailure | null = null;
  private creating: Promise<string | null> | null = null;
  private finalizing = false;
  private recordStarted = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: CallContext) {
    this.ctx = ctx;
  }

  /**
   * Claim the sending number in Twenty. Another member holding it answers
   * 409 and the dial must not go ahead. Without a number or member there is
   * nothing to claim and the dial proceeds.
   */
  async claim(): Promise<{ ok: true } | { ok: false; message: string }> {
    const { phoneId, member } = this.ctx;
    if (!phoneId || !member || this.ctx.simulated) return { ok: true };
    try {
      await api.twentyPhones.claim(phoneId, { memberId: member.id, memberEmail: member.email });
      this.hold = { phoneId, memberId: member.id };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err?.message || "Number is in use" };
    }
  }

  setPhoneActive() {
    const hold = this.hold;
    if (!hold) return;
    api.twentyPhones.setState(hold.phoneId, { memberId: hold.memberId, state: "ACTIVE" }).catch((err) => sipLog.warn("app", `number state not set to ACTIVE: ${err?.message || err}`));
  }

  /**
   * Keep the claim fresh for the whole live call. The backend treats a claim
   * as stale 15s after the last beat, sooner than the unanswered timeout, so
   * without it another agent could take the number mid-ring.
   */
  startHeartbeat(intervalMs: number, isLive: () => boolean) {
    this.stopHeartbeat();
    if (!this.hold) return;
    this.heartbeat = setInterval(() => {
      const hold = this.hold;
      if (!hold || !isLive()) {
        this.stopHeartbeat();
        return;
      }
      api.twentyPhones.heartbeat(hold.phoneId, { memberId: hold.memberId }).catch((err) => sipLog.warn("app", `claim heartbeat failed: ${err?.message || err}`));
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  async release() {
    this.stopHeartbeat();
    const hold = this.hold;
    if (!hold) return;
    this.hold = null;
    try {
      await api.twentyPhones.release(hold.phoneId, { memberId: hold.memberId, callId: this.callId ?? undefined });
    } catch (err: any) {
      // The claim still goes stale without heartbeats, so the number frees
      // itself; log it so a stuck "in use" number can be traced.
      sipLog.warn("app", `number release failed (it frees itself when the claim goes stale): ${err?.message || err}`);
    }
  }

  /**
   * Open the agencyCalls row once (IN_PROGRESS). Guarded: the dial path,
   * recording start and finalize can all race to it.
   */
  ensureRow(): Promise<string | null> {
    if (this.ctx.simulated) return Promise.resolve(null);
    if (this.callId) return Promise.resolve(this.callId);
    if (this.creating) return this.creating;
    this.creating = (async () => {
      try {
        const row = await api.calls.create({
          direction: this.ctx.direction.toUpperCase(),
          status: "IN_PROGRESS",
          fromNumber: this.ctx.fromNumber || undefined,
          toNumber: this.ctx.toNumber || undefined,
          startedAt: this.startedAt,
          agencyPhoneId: this.hold?.phoneId || this.ctx.phoneId || undefined,
          agencyProspectId: this.ctx.prospectId || undefined,
          agencyLeadId: this.ctx.leadId || undefined,
        });
        this.callId = row?.id ?? null;
        return this.callId;
      } catch (err: any) {
        sipLog.error("app", `call history persistence failed at dial time: ${err?.message || err}`);
        return null;
      } finally {
        this.creating = null;
      }
    })();
    return this.creating;
  }

  /**
   * Start Telnyx server-side recording (and transcription). SIP-trunked calls
   * are not recorded otherwise, so no call.recording.saved webhook would come.
   */
  async startRecording(onError: (message: string) => void) {
    if (this.ctx.simulated || this.recordStarted) return;
    const ccid = this.telnyxCallControlId;
    const id = await this.ensureRow();
    if (!ccid || !id) return;
    this.recordStarted = true;
    try {
      // /record reads the row fresh, so stamp the call-control-id first.
      await api.calls.update(id, { telnyxCallId: ccid });
      const res = await api.calls.record(id);
      sipLog.info("invite", "server recording started", { telnyxRecordingId: res?.telnyxRecordingId ?? null });
    } catch (err: any) {
      this.recordStarted = false;
      const msg = `Server recording failed to start: ${err?.message || err}`;
      sipLog.error("invite", msg);
      onError(msg);
    }
  }

  /** Phone-audio calls are recorded by Telnyx from answer (dial record option). */
  markRecordedByBridge(contactLegId: string) {
    this.telnyxCallControlId = contactLegId;
    this.recordStarted = true;
  }

  /** Close the row when the call ends. Runs once, whoever ends the call first. */
  async finalize(outcome: string, durationSeconds: number) {
    if (this.ctx.simulated || this.finalizing) return;
    this.finalizing = true;
    const report = getReport(getSipConfig(), this.lastFailure ?? {
      kind: "NONE", title: "No failure", detail: "Call ended without a classified failure.", hint: "",
    }, this.telnyxCallControlId);
    const debugLog = JSON.stringify(report).slice(0, 8000);
    const closing = {
      status: mapOutcomeToCallStatus(outcome),
      endedAt: new Date().toISOString(),
      durationSeconds,
      telnyxCallId: this.telnyxCallControlId || undefined,
      debugLog,
    };
    const id = this.callId ?? (await this.ensureRow());
    if (!id) return;
    try {
      await api.calls.update(id, closing);
    } catch (err: any) {
      sipLog.error("app", `call history persistence failed at finalize: ${err?.message || err}`);
    }
  }

  /** Autosave the dock's notes onto the call row. */
  async saveNotes(notes: string) {
    const id = this.callId ?? (await this.ensureRow());
    if (!id) return;
    await api.calls.update(id, { notes });
  }

  /**
   * Wrap-up: write the operator's disposition and notes, ask the backend to
   * reconcile the recording, then release the number. Throws when the
   * disposition write fails so the dock can say so.
   */
  async wrapUp(outcome: string, notes: string) {
    const id = this.callId;
    let error: unknown = null;
    if (id) {
      try {
        await api.calls.update(id, { status: mapOutcomeToCallStatus(outcome), notes });
      } catch (err) {
        error = err;
        sipLog.error("app", `disposition not saved for call ${id}: ${(err as any)?.message || err}`);
      }
      api.calls.reconcile(id).catch((err) => sipLog.warn("app", `recording reconcile failed for call ${id}: ${err?.message || err}`));
    }
    await this.release();
    if (error) throw error;
  }

  /**
   * Last-breath flush on tab close. React cleanup never runs then, so this is
   * the only way to stop a row sticking IN_PROGRESS and a number staying
   * claimed: keepalive fetches survive unload.
   */
  flushOnHide(outcome: string, durationSeconds: number) {
    try {
      const token = getAuthToken();
      if (!token) return;
      const base = import.meta.env.VITE_API_URL || "";
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const hold = this.hold;
      if (hold) {
        this.hold = null;
        fetch(`${base}/api/twenty/phones/${hold.phoneId}/release`, {
          method: "POST",
          headers,
          body: JSON.stringify({ memberId: hold.memberId, callId: this.callId ?? undefined }),
          keepalive: true,
        }).catch(() => {});
      }
      if (this.callId) {
        const ccid = this.telnyxCallControlId;
        fetch(`${base}/api/calls/${this.callId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: mapOutcomeToCallStatus(outcome),
            endedAt: new Date().toISOString(),
            durationSeconds,
            ...(ccid ? { telnyxCallId: ccid } : {}),
          }),
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // never throw during unload
    }
  }
}
