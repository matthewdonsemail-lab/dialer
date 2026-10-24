import { sipLog } from "@/domains/dialer/sip";

/**
 * Plays a recording into a live call as if the operator were speaking it:
 * decode it, send it through a Web Audio destination, and swap that in for
 * the microphone on the call's audio sender. Resolves when the message has
 * finished (so the caller can hang up). Needs a live call, so it is verified
 * on real calls.
 */
export async function playVoicemailIntoCall(session: any, blob: Blob): Promise<{ durationMs: number }> {
  const pc: RTCPeerConnection | undefined = session?.sessionDescriptionHandler?.peerConnection;
  const sender = pc?.getSenders().find((s) => s.track?.kind === "audio" || s.track === null);
  if (!pc || !sender) throw new Error("No audio sender on the call.");

  const ctx = new AudioContext();
  try {
    await ctx.resume();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const destination = ctx.createMediaStreamDestination();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    const track = destination.stream.getAudioTracks()[0];
    const original = sender.track;
    await sender.replaceTrack(track);
    // The microphone track was muted for screening; leave it that way.
    if (original) original.enabled = false;
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    // Let the last audio reach the other end before the caller hangs up.
    await new Promise((r) => setTimeout(r, 400));
    sipLog.info("audio", "voicemail played into the call", { ms: Math.round(buffer.duration * 1000) });
    return { durationMs: Math.round(buffer.duration * 1000) };
  } finally {
    void ctx.close().catch(() => {});
  }
}
