import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Check, Clock, LogOut, Monitor, Moon, Palette, PhoneOutgoing, Sun, Timer, User, type IconComponent } from "@/components/ui/icons";
import { InfoTip, TipCard, type TipSpec } from "@/components/ui/InfoTip";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { signOut } from "@/lib/auth";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { DEFAULT_CALL_GOAL, DEFAULT_CONVERSATION_SECONDS, useReportSettings } from "@/hooks/use-report-settings";

/** What each Reports number means; shown in Settings so the definitions live next to the goals. */
function reportDefinitions(seconds: number, goal: number): TipSpec[] {
  return [
    {
      title: "Calls & Conversations",
      icon: BarChart3,
      what: "How many calls were made, and how many turned into real conversations.",
      formula: ["Connected call", "≥", `${seconds}s`, "=", "Conversation"],
      key: [
        { color: "#2563eb", label: "Outbound", note: "calls you made" },
        { color: "#22c55e", label: "Convos", note: "real conversations" },
        { color: "#60a5fa", label: "Inbound", note: "calls received" },
      ],
    },
    {
      title: "Time Spent",
      icon: Clock,
      what: "Total connected call minutes, split into inbound and outbound.",
      key: [
        { color: "#2563eb", label: "Outbound" },
        { color: "#60a5fa", label: "Inbound" },
      ],
      use: "Spot trends or lulls in activity.",
    },
    {
      title: "Calls Made",
      icon: PhoneOutgoing,
      what: "Calls per team member, per day.",
      formula: ["Calls in a day", "≥", String(goal), "=", "Goal hit"],
      key: [{ color: "rgba(16,185,129,0.35)", label: "Green cell", note: "goal reached" }],
    },
  ];
}

function NumberSetting({
  label,
  icon,
  help,
  value,
  onChange,
  min,
  max,
  suffix,
  defaultValue,
}: {
  label: string;
  icon: IconComponent;
  help: TipSpec;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix: string;
  defaultValue: number;
}) {
  return (
    <label className="block rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4">
      <span className="flex items-center gap-2.5 mb-3">
        <span className="w-9 h-9 shrink-0 rounded-[8px] flex items-center justify-center bg-blue-500/15 text-blue-600">
          {React.createElement(icon, { className: "w-4 h-4" })}
        </span>
        <span className="flex-1 text-[15px] font-semibold text-[var(--ods-text-primary)]">{label}</span>
        <InfoTip tip={{ icon, ...help }} />
      </span>
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
          className="w-28 h-10 px-3 rounded-[7px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] text-[16px] font-semibold text-[var(--ods-text-primary)] tabular-nums outline-none focus:border-[var(--ods-brand-500)]"
        />
        <span className="text-[13px] font-medium text-[var(--ods-text-secondary)]">{suffix}</span>
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
    <PageCanvas
      title="Settings"
      maxWidth="4xl"
      info={{ title: "Settings", icon: Palette, what: "Appearance, report goals and your account.", use: "Changes save on this browser." }}
    >
      <div className="space-y-4">
        <WidgetCard
          title="Appearance"
          icon={Palette}
          info={{ title: "Appearance", icon: Palette, what: "How the dialer looks on this browser.", use: "Pick Light, Dark, or follow your computer." }}
        >
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

        <WidgetCard
          title="Reports"
          icon={BarChart3}
          info={{
            title: "Report settings",
            icon: BarChart3,
            what: "Goals and definitions used by the Reports page.",
            use: "Changes save on this browser and update Reports straight away.",
          }}
          action={
            <Link to="/reports" className="text-[12px] font-medium text-[var(--ods-brand-600)] hover:underline">
              Open Reports
            </Link>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <NumberSetting
              label="Daily call goal"
              icon={PhoneOutgoing}
              help={{
                title: "Daily call goal",
                what: "Outbound calls each team member aims for per day.",
                formula: ["Calls in a day", "≥", "Goal", "=", "Green cell"],
                use: "Weekly views use 5× this goal.",
              }}
              value={dailyCallGoal}
              onChange={setDailyCallGoal}
              min={1}
              max={2000}
              suffix="calls / day"
              defaultValue={DEFAULT_CALL_GOAL}
            />
            <NumberSetting
              label="Conversation length"
              icon={Timer}
              help={{
                title: "Conversation length",
                what: "How long a connected call must last to count as a conversation.",
                formula: ["Connected call", "≥", "This length", "=", "Conversation"],
              }}
              value={conversationSeconds}
              onChange={setConversationSeconds}
              min={5}
              max={1800}
              suffix="seconds"
              defaultValue={DEFAULT_CONVERSATION_SECONDS}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {reportDefinitions(conversationSeconds, dailyCallGoal).map((d) => (
              <div key={d.title} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3">
                <TipCard tip={d} />
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
