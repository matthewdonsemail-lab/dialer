import { usePersistedState } from "@/domains/app/persistedState";

/**
 * Audio source for calls (Settings -> Audio Source), saved on this browser
 * and used until changed — like WAVV's Dialer Settings.
 *   computer : this computer's microphone and speaker (or a headset)
 *   call_me  : the dialer rings your phone and you talk through it
 *   dial_in  : you call the dial-in number and enter a PIN
 */
export type AudioSource = "computer" | "call_me" | "dial_in";

export function useAudioSettings() {
  const [source, setSource] = usePersistedState<AudioSource>("audio-source", "computer");
  const [microphoneId, setMicrophoneId] = usePersistedState("audio-microphone-id", "");
  const [speakerId, setSpeakerId] = usePersistedState("audio-speaker-id", "");
  const [callMeNumber, setCallMeNumber] = usePersistedState("audio-call-me-number", "");
  return { source, setSource, microphoneId, setMicrophoneId, speakerId, setSpeakerId, callMeNumber, setCallMeNumber };
}
