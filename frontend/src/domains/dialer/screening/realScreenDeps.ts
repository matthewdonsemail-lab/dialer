import { startRemoteProbe } from "@/domains/dialer/answerProbe";
import { playVoicemailIntoCall } from "@/domains/dialer/voicemail";
import type { ScreenDeps } from "./answerScreen";

/** The real audio probe and voicemail playback. Kept apart from answerScreen.ts so tests load without SIP config. */
export const REAL_SCREEN_DEPS: ScreenDeps = { startProbe: startRemoteProbe, playVoicemail: playVoicemailIntoCall };
