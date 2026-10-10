import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Check, Headphones, LogOut, Monitor, Moon, Palette, Sun, User } from "@/components/ui/icons";
import { AudioSourceSettings } from "@/components/audio/AudioSourceSettings";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { signOut } from "@/lib/auth";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { DEFAULT_CALL_GOAL, DEFAULT_CONVERSATION_SECONDS, useReportSettings } from "@/hooks/use-report-settings";

/** What each Reports number means; shown in Settings so the definitions live next to the goals. */
const REPORT_DEFINITIONS: { title: string; lines: string[] }[] = [
  {
    title: "Calls & Conversations",
    lines: [
      "How many calls were made, and how many turned into real conversations.",
      "Calls = every outbound call attempt.",
      "Conversations = connected calls lasting at least the conversation length below.",
      "Hover over a bar to see the exact numbers.",
    ],
  },
  {
    title: "Time Spent",
    lines: [
      "Total connected call minutes, split into inbound and outbound.",
      "Hover over a bar to see the exact numbers.",
      "Shows where talk time goes and makes trends or lulls in activity easy to spot.",
    ],
  },
  {
    title: "Calls Made & Outbound Conversations",
    lines: [
      "Per team member, per day. A day turns green once it reaches the daily call goal.",
    ],
  },
];

function NumberSetting({
  label,
  help,
  value,
  onChange,
  min,
  max,
  suffix,
  defaultValue,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix: string;
  defaultValue: number;
}) {
  return (
    <label className="block rounded-[8px] border border-[var(--ods-border)] p-3">
      <span className="block text-[13px] font-semibold text-[var(--ods-text-primary)]">{label}</span>
      <span className="block text-[12px] text-[var(--ods-text-secondary)] mt-0.5 mb-2">{help}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-24 h-8 px-2 rounded-[6px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[13px] text-[var(--ods-text-primary)] tabular-nums outline-none focus:border-[var(--ods-brand-500)]"
        />
        <span className="text-[12px] text-[var(--ods-text-secondary)]">{suffix}</span>
        {value !== defaultValue && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="ml-auto text-[12px] font-medium text-[var(--ods-brand-600)] hover:underline"
          >
            Reset to {defaultValue}
          </button>
        )}
      </span>
    </label>
  );
}

const THEME_OPTIONS: { mode: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", description: "Bright surfaces for daytime work", icon: Sun },
  { mode: "dark", label: "Dark", description: "Easier on the eyes on long call blocks", icon: Moon },
  { mode: "system", label: "System", description: "Match this computer's setting", icon: Monitor },
];

/** Miniature of the app in a given theme, so the choice is visible before picking it. */
function ThemePreview({ dark }: { dark: boolean }) {
  const bg = dark ? "#0f1419" : "#ffffff";
  const panel = dark ? "#1a2027" : "#f8f9fc";
  const line = dark ? "#374151" : "#e5e7eb";
  const bar = dark ? "#252d36" : "#e5e7eb";
  return (
    <div className="h-16 rounded-[6px] overflow-hidden flex border" style={{ background: bg, borderColor: line }} aria-hidden="true">
      <div className="w-1/4 p-1.5 space-y-1" style={{ background: panel, borderRight: `1px solid ${line}` }}>
        <div className="h-1.5 rounded-sm bg-[#2563eb]" />
        <div className="h-1.5 rounded-sm" style={{ background: bar }} />
        <div className="h-1.5 rounded-sm" style={{ background: bar }} />
      </div>
      <div className="flex-1 p-1.5 space-y-1">
        <div className="h-1.5 w-1/2 rounded-sm" style={{ background: bar }} />
        <div className="h-1.5 w-5/6 rounded-sm" style={{ background: bar }} />
        <div className="h-1.5 w-2/3 rounded-sm" style={{ background: bar }} />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { mode, setMode } = useTheme();
  const { dailyCallGoal, setDailyCallGoal, conversationSeconds, setConversationSeconds } = useReportSettings();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <PageCanvas title="Settings" maxWidth="4xl">
      <div className="space-y-4">
        <WidgetCard title="Appearance" icon={Palette}>
          <p className="text-[12px] text-[var(--ods-text-secondary)] mb-3">Choose how the dialer looks on this browser.</p>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ mode: option, label, description, icon: Icon }) => {
              const selected = mode === option;
              return (
                <button
                  key={option}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMode(option)}
                  className={`text-left rounded-[8px] border p-3 space-y-2.5 transition-colors ${
                    selected
                      ? "border-[var(--ods-brand-600)] ring-1 ring-[var(--ods-brand-600)]"
                      : "border-[var(--ods-border)] hover:border-[var(--ods-border-strong)]"
                  }`}
                >
                  {option === "system" ? (
                    <div className="grid grid-cols-2 gap-1">
                      <ThemePreview dark={false} />
                      <ThemePreview dark />
                    </div>
                  ) : (
                    <ThemePreview dark={option === "dark"} />
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--ods-text-primary)]">
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </div>
                      <p className="text-[12px] text-[var(--ods-text-secondary)] mt-0.5">{description}</p>
                    </div>
                    {selected && <Check className="w-4 h-4 flex-shrink-0 text-[var(--ods-brand-600)]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </WidgetCard>

        <WidgetCard title="Audio Source" icon={Headphones}>
          <AudioSourceSettings />
        </WidgetCard>

        <WidgetCard
          title="Reports"
          icon={BarChart3}
          action={
            <Link to="/reports" className="text-[12px] font-medium text-[var(--ods-brand-600)] hover:underline">
              Open Reports
            </Link>
          }
        >
          <p className="text-[12px] text-[var(--ods-text-secondary)] mb-3">
            Goals and definitions used by the Reports page. Saved on this browser.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <NumberSetting
              label="Daily call goal"
              help="Outbound calls each team member aims for per day."
              value={dailyCallGoal}
              onChange={setDailyCallGoal}
              min={1}
              max={2000}
              suffix="calls / day"
              defaultValue={DEFAULT_CALL_GOAL}
            />
            <NumberSetting
              label="Conversation length"
              help="A connected outbound call this long or longer counts as a conversation."
              value={conversationSeconds}
              onChange={setConversationSeconds}
              min={5}
              max={1800}
              suffix="seconds"
              defaultValue={DEFAULT_CONVERSATION_SECONDS}
            />
          </div>
          <div className="space-y-3">
            {REPORT_DEFINITIONS.map((d) => (
              <div key={d.title}>
                <h4 className="text-[13px] font-semibold text-[var(--ods-text-primary)]">{d.title}</h4>
                <ul className="mt-1 space-y-0.5 list-disc pl-5 text-[12px] text-[var(--ods-text-secondary)]">
                  {d.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Account" icon={User}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--ods-text-primary)] truncate">
                {user?.fullName || user?.email?.split("@")[0] || "Signed in"}
              </p>
              <p className="text-[12px] text-[var(--ods-text-secondary)] truncate">{user?.email}</p>
              <p className="text-[12px] text-[var(--ods-text-tertiary)] mt-1">
                Your profile is managed in Twenty, the dialer's sign-in.
              </p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              className="h-8 px-3 shrink-0 rounded-[6px] border border-[var(--ods-border)] text-[12px] font-medium text-[var(--ods-text-primary)] hover:bg-[var(--ods-hover)] flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </WidgetCard>
      </div>
    </PageCanvas>
  );
}
