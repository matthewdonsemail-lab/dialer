import { telnyxClient } from "../telnyx/index.js";
import { audioSessionStore } from "../twenty/audioSession/index.js";
import { encodeState, type BridgeDeps, type BridgeState } from "./index.js";

/**
 * Phone audio needs a Telnyx Call Control application (its webhook URL set
 * to /api/webhooks/telnyx?token=...) and, for Dial in, a number assigned to it.
 */
export function bridgeConfig() {
  return {
    appId: process.env.TELNYX_CALL_CONTROL_APP_ID?.trim() || "",
    dialInNumber: process.env.TELNYX_DIAL_IN_NUMBER?.trim() || "",
  };
}

const VOICE = { voice: "female", language: "en-US" as const };

export const telnyxBridgeCalls = {
  async answer(callControlId: string, state: BridgeState) {
    await telnyxClient().calls.actions.answer(callControlId, { client_state: encodeState(state) });
  },
  async gather(callControlId: string, prompt: string, state: BridgeState) {
    await telnyxClient().calls.actions.gatherUsingSpeak(callControlId, {
      ...VOICE,
      payload: prompt,
      minimum_digits: 4,
      maximum_digits: 4,
      valid_digits: "0123456789",
      terminating_digit: "#",
      timeout_millis: 20_000,
      client_state: encodeState(state),
    });
  },
  async speak(callControlId: string, text: string, state: BridgeState) {
    await telnyxClient().calls.actions.speak(callControlId, { ...VOICE, payload: text, client_state: encodeState(state) });
  },
  async hangup(callControlId: string) {
    await telnyxClient().calls.actions.hangup(callControlId, {});
  },
  /** Places a call; returns its call_control_id. */
  async dial(params: {
    to: string;
    from: string;
    state: BridgeState;
    linkTo?: string;
    record?: boolean;
    timeoutSecs?: number;
  }): Promise<string> {
    const { appId } = bridgeConfig();
    const res = await telnyxClient().calls.dial({
      connection_id: appId,
      to: params.to,
      from: params.from,
      client_state: encodeState(params.state),
      timeout_secs: params.timeoutSecs ?? 30,
      ...(params.linkTo
        ? { link_to: params.linkTo, bridge_on_answer: true, park_after_unbridge: "self" }
        : {}),
      ...(params.record ? { record: "record-from-answer" as const, record_format: "mp3" as const, record_channels: "dual" as const } : {}),
    });
    const id = res?.data?.call_control_id;
    if (!id) throw new Error("Telnyx did not return a call_control_id");
    return id;
  },
};

export function bridgeDeps(): BridgeDeps {
  return {
    store: audioSessionStore,
    calls: telnyxBridgeCalls,
    dialInNumber: bridgeConfig().dialInNumber || null,
    now: () => new Date(),
  };
}
