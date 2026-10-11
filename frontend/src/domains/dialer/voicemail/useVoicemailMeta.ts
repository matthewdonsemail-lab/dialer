import { useEffect, useState } from "react";
import { loadVoicemail, onVoicemailChanged } from "./voicemailStore";

/**
 * Is there a recorded voicemail? Light enough for any card to ask: it reads the
 * store once and again whenever the recording changes, with none of the
 * recorder's microphone and playback machinery.
 */
export function useVoicemailMeta(): { hasRecording: boolean; loaded: boolean } {
  const [state, setState] = useState({ hasRecording: false, loaded: false });
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      loadVoicemail()
        .then((r) => alive && setState({ hasRecording: !!r, loaded: true }))
        .catch(() => alive && setState({ hasRecording: false, loaded: true }));
    void refresh();
    const off = onVoicemailChanged(() => void refresh());
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}
