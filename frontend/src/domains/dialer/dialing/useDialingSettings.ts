import { usePersistedState } from "@/domains/app/persistedState";
import { DEFAULT_DIALING_MODE, parseDialingMode, type DialingMode } from "./dialingModes";

/**
 * Settings -> Dialing, saved on this browser and shared live with the dialer.
 *   mode            Standard, Advanced or Answer Boost
 *   leaveVoicemail  leave the recorded voicemail when Answer Boost hits a machine
 */
export function useDialingSettings() {
  const [rawMode, setMode] = usePersistedState<DialingMode>("dialing-mode", DEFAULT_DIALING_MODE);
  const [leaveVoicemail, setLeaveVoicemail] = usePersistedState<boolean>("dialing-leave-voicemail", true);
  return {
    mode: parseDialingMode(rawMode),
    setMode,
    leaveVoicemail: leaveVoicemail !== false,
    setLeaveVoicemail,
  };
}
