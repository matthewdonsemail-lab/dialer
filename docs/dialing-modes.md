# Dialing modes and answering-machine detection

How the power dialer moves through a campaign, how it tells a person from an
answering machine, and the voicemail it can leave. Everything is under
**Settings → Dialing** (and the same sections in the dialer's own settings
sheet), saved on the browser.

## The three modes

| Mode | After a call nobody answers | When someone answers | When a machine answers |
|---|---|---|---|
| Standard | Shows the call summary; **Save & next** dials the next contact | You talk, then Save & next | You hear it, then Save & next |
| Advanced | Logged as No answer and the next contact is dialed, no clicks | Stops for you | Stops for you (you are connected to it) |
| Answer Boost | Same as Advanced | You are connected once it is a person | Hung up on (or your voicemail is left) and the next contact is dialed, no clicks |

The rules live in `frontend/src/domains/dialer/dialing/dialingModes.ts` and
are unit tested. Answer Boost rings for at least 35 seconds whatever the saved
ring time is, so a machine's greeting and beep are reached.

An unanswered call is logged as **No answer**; a machine skipped by Answer Boost
is also logged as No answer, with the note "Answering machine detected:
skipped automatically." A voicemail left is logged as **Left Voicemail** with a
note. No Twenty schema change is involved.

A real failure (SIP error, no registration) always stops the dialer for you to
see; it is never skipped automatically.

## How detection works

Browser calls go over SIP.js, where Telnyx's own answering-machine detection
is not available (it only works on calls the server controls). So the dialer
listens to the call's incoming audio in the browser:

1. When the other side answers, the line is open but you hear nothing and they
   hear nothing from you (the microphone track is muted).
2. A probe (`answerProbe/remoteAudioProbe.ts`) turns the incoming audio into
   frames: is it speech, is it a steady tone (a beep)? It uses an AudioWorklet,
   driven by the audio clock, so a background tab is not throttled.
3. The analyzer (`answerDetection/answerAnalyzer.ts`) decides:
   - a short greeting (up to 4.5 seconds from first sound to last) followed by
     about a second of silence is a **person** (they are waiting for you);
   - a greeting that runs past 4.5 seconds, or a steady beep, is a **machine**;
   - nothing decisive (silent pickup, noise) is **unsure**, and unsure
     connects you. Connecting an operator to a machine costs seconds; dropping
     a real person costs a lead.
4. A person: the microphone and speaker are switched on and the call clock
   starts. For the next 12 seconds a beep raises "This may be a voicemail".
5. A machine, with a recorded voicemail: it waits for the beep (or, with no
   beep, a quiet after the greeting), plays the recording into the call, hangs
   up and dials the next contact. Without a recording, it hangs up at once. It
   never plays over the greeting; if no cue comes within 30 seconds it hangs up
   without leaving anything.

It is not perfect. A machine whose greeting starts with a short phrase and a
long pause can be taken for a person; an automated message with no beep may be
connected. That is the intended direction of error.

## Outbound voicemail

Record it under Settings → Dialing → Outbound voicemail (up to 45 seconds, with
the microphone chosen under Audio Source). It is kept in the browser's
IndexedDB (`dialer-voicemail`), so it is per browser, not shared across the
team.

## Not built

- Dialing several contacts at once (WAVV's "up to three in the background").
  It needs several live calls, a shared number claim and a hand-over of the
  live one, and a wrong guess then drops a real person.
- Answer Boost with phone audio (Call me / Dial in): the audio is not in the
  browser, so it behaves like Advanced.

## Testing

Unit tests cover the decisions (`answerAnalyzer.test.ts`), the audio maths
(`audioFrames.test.ts`), the mode rules (`dialingModes.test.ts`) and the whole
listen, decide, wait for the beep, leave the message flow with a fake probe
(`screening/answerScreen.test.ts`). The probe and the playback also run
against two real WebRTC peers in a browser, but a real phone call is the only
full test: try Answer Boost on a short list of known numbers first.
