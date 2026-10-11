import { useState } from "react";
import { Button } from "@/domains/ui/button";
import { Chip } from "@/domains/ui/chip";
import { InfoTip } from "@/domains/ui/infoTip";
import { SelectMenu } from "@/domains/ui/menu";
import { Notice } from "@/domains/ui/notice";
import { Skeleton } from "@/domains/ui/skeleton";
import { Check, ChevronDown, Mic, Pause, Phone, PhoneOutgoing, Play, Sparkles, Square, Trash2, Voicemail, type IconComponent } from "@/domains/ui/icons";
import {
  DEFAULT_UNANSWERED_TIMEOUT_SECONDS,
  UNANSWERED_TIMEOUT_CHOICES,
  getUnansweredTimeoutSeconds,
  setUnansweredTimeoutSeconds,
} from "@/domains/app/config";
import {
  BOOST_MIN_RING_SECONDS,
  DIALING_MODES,
  MODE_INFO,
  effectiveRingSeconds,
  useDialingSettings,
  type DialingMode,
} from "@/domains/dialer/dialing";
import { MAX_VOICEMAIL_MS, useOutboundVoicemail, useVoicemailMeta } from "@/domains/dialer/voicemail";
import { clock as formatClock } from "@/domains/campaigns/stats";
import { useAudioSettings } from "@/domains/dialer/audio";

const MODE_ICON: Record<DialingMode, IconComponent> = { standard: Phone, advanced: PhoneOutgoing, boost: Sparkles };

const clock = (ms: number) => formatClock(ms / 1000);

/**
 * Settings -> Dialing: the dialing mode, what Answer Boost does with
 * machines, and how long a call rings. Shared by the Settings page and the
 * dialer's own settings sheet, so there is one place to change it.
 */
export function DialingModeSettings() {
  const { mode, setMode, leaveVoicemail, setLeaveVoicemail } = useDialingSettings();
  const { source: audioSource } = useAudioSettings();
  const { hasRecording, loaded } = useVoicemailMeta();
  const [savedRing, setSavedRing] = useState(getUnansweredTimeoutSeconds);
  const ring = effectiveRingSeconds(mode, savedRing);
  const willLeave = leaveVoicemail && hasRecording;

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Dialing mode" className="grid gap-3 sm:grid-cols-3">
        {DIALING_MODES.map((m) => {
          const info = MODE_INFO[m];
          const Icon = MODE_ICON[m];
          const selected = mode === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m)}
              className={`text-left rounded-[10px] border p-3 space-y-2 transition-colors bg-[var(--ods-bg-primary)] ${
                selected ? "border-[var(--ods-brand-600)] ring-2 ring-[var(--ods-brand-600)]" : "border-[var(--ods-border)] hover:border-[var(--ods-border-strong)]"
              }`}
            >
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--ods-text-primary)]">
                <span className="w-7 h-7 rounded-md flex items-center justify-center bg-blue-500/15 text-blue-600">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1">{info.label}</span>
                {selected && <Check className="w-4 h-4 text-[var(--ods-brand-600)]" aria-hidden="true" />}
              </div>
              <p className="text-[13px] text-[var(--ods-text-secondary)]">{info.description}</p>
              <p className="text-[12px] text-[var(--ods-text-tertiary)]">Great for: {info.suits}</p>
            </button>
          );
        })}
      </div>

      {mode === "boost" && audioSource !== "computer" && (
        <Notice tone="warning" title="Answer Boost needs computer audio">
          It listens to who answers through this computer's audio. With phone audio it still skips unanswered calls, but it cannot tell a machine from a person.
        </Notice>
      )}

      {mode === "boost" && (
        <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--ods-text-primary)]">
                Leave my voicemail
                <InfoTip
                  tip={{
                    title: "Leave my voicemail",
                    icon: Voicemail,
                    what: "When a machine answers, wait for the beep and play your recorded voicemail, then hang up and call the next contact.",
                    use: "Record it under Outbound voicemail below. Without a recording, machines are skipped.",
                  }}
                />
              </div>
              <p className="text-[12px] text-[var(--ods-text-secondary)]">
                {!loaded ? "Checking for your recording…" : hasRecording ? "Plays your recording after the beep." : "No recording yet, so machines are skipped."}
              </p>
            </div>
            <Button icon={Voicemail} pressed={willLeave} disabled={!hasRecording} onClick={() => setLeaveVoicemail(!leaveVoicemail)}>
              {willLeave ? "On" : "Off"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--ods-text-primary)]">
            Ring for
            <InfoTip
              tip={{
                title: "Ring for",
                icon: Phone,
                what: "How long a call rings, counted from the first ring, before it is logged as No answer.",
                use: `Most businesses answer within 4 to 6 rings. Answer Boost rings for at least ${BOOST_MIN_RING_SECONDS} seconds so a machine's greeting and beep are reached.`,
              }}
            />
          </div>
          <p className="text-[12px] text-[var(--ods-text-secondary)]">
            {mode === "boost" && ring !== savedRing ? `Answer Boost uses ${ring} seconds (your ${savedRing} is too short for it).` : `${ring} seconds of ringing.`}
          </p>
        </div>
        <SelectMenu
          value={String(savedRing)}
          onChange={(v) => {
            const n = Number(v);
            setUnansweredTimeoutSeconds(n);
            setSavedRing(n);
          }}
          width={220}
          sections={[
            {
              title: "Give up after",
              options: UNANSWERED_TIMEOUT_CHOICES.map((n) => ({
                value: String(n),
                label: `${n} seconds of ringing`,
                hint: n === DEFAULT_UNANSWERED_TIMEOUT_SECONDS ? "default" : undefined,
              })),
            },
          ]}
          triggerTitle="How long a call rings before it is logged as No answer"
          triggerClassName="h-9 px-3 inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--ods-border-strong)] text-[13px] font-semibold text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)]"
          trigger={
            <>
              {savedRing} seconds
              <ChevronDown className="w-3 h-3 opacity-60" />
            </>
          }
        />
      </div>
    </div>
  );
}

/** Settings -> Dialing: record the voicemail Answer Boost leaves on machines. */
export function VoicemailSettings() {
  const vm = useOutboundVoicemail();
  const busy = vm.status === "saving";

  if (!vm.loaded) return <Skeleton className="h-16 rounded-[10px]" />;

  return (
    <div className="space-y-3">
      {vm.error && <Notice tone="negative">{vm.error}</Notice>}

      {vm.status === "recording" ? (
        <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-md bg-red-600 animate-pulse" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-[var(--ods-text-primary)] tabular-nums" role="timer">
              {clock(vm.elapsedMs)} <span className="font-normal text-[var(--ods-text-tertiary)]">/ {clock(MAX_VOICEMAIL_MS)}</span>
            </span>
            <div className="flex-1 h-2 rounded-md bg-[var(--ods-bg-tertiary)] overflow-hidden" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(vm.level * 100)}>
              <div className="h-full rounded-md bg-emerald-500 transition-[width] duration-75" style={{ width: `${vm.level * 100}%` }} />
            </div>
          </div>
          <p className="text-[13px] text-[var(--ods-text-secondary)]">Speak as you would to someone's voicemail: who you are, why you called, how to reach you.</p>
          <div className="flex gap-2">
            <Button variant="primary" icon={Square} onClick={vm.stop}>
              Stop and save
            </Button>
            <Button variant="ghost" onClick={vm.cancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : vm.recording ? (
        <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] space-y-1">
            <div className="text-[15px] font-semibold text-[var(--ods-text-primary)]">Your voicemail</div>
            <div className="flex flex-wrap gap-2">
              <Chip icon={Voicemail}>{clock(vm.recording.durationMs)}</Chip>
              <Chip>Recorded {new Date(vm.recording.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Chip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {vm.status === "playing" ? (
              <Button icon={Pause} onClick={vm.stopPlayback}>
                Stop
              </Button>
            ) : (
              <Button icon={Play} disabled={busy} onClick={() => void vm.play()}>
                Play
              </Button>
            )}
            <Button icon={Mic} disabled={busy || vm.status === "playing"} onClick={() => void vm.start()}>
              Record again
            </Button>
            <Button variant="danger-soft" icon={Trash2} disabled={busy || vm.status === "playing"} onClick={() => void vm.remove()}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-[15px] font-semibold text-[var(--ods-text-primary)]">No voicemail recorded</div>
            <p className="text-[12px] text-[var(--ods-text-secondary)]">Up to {MAX_VOICEMAIL_MS / 1000} seconds, recorded with your microphone from Audio Source.</p>
          </div>
          <Button variant="primary" icon={Mic} busy={busy} busyLabel="Saving…" onClick={() => void vm.start()}>
            Record voicemail
          </Button>
        </div>
      )}
    </div>
  );
}
