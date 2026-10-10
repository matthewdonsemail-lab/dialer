/**
 * Pure calculations behind the Reports page (WAVV-style call reporting).
 * Everything works from agencyCalls rows; no extra API.
 *
 * Definitions (shown on the page so the numbers are never a mystery):
 *   - Call:          every outbound call attempt
 *   - Connected:     a call that reached someone or something (not No Answer,
 *                    Busy, Failed or still in progress)
 *   - Conversation:  a connected outbound call lasting at least the
 *                    conversation threshold (60s by default, set in Settings)
 *   - Time spent:    connected call minutes
 */
import { DISPOSITIONS, callStatusLabel, dispositionTypeOfStatus, type DispositionType } from "@/lib/call-outcome";

export interface ReportCall {
  id: string;
  direction: string | null;
  status: string | null;
  fromNumber: string | null;
  durationSeconds: number;
  startedAt: string | null;
  created_at: string;
  createdBy: { name?: string } | null;
}

export type RangePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Last month",
};

export interface DateRange {
  /** Inclusive local-midnight start. */
  start: Date;
  /** Exclusive local-midnight end. */
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function rangeFor(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = startOfDay(now);
  switch (preset) {
    case "today":
      return { start: today, end: addDays(today, 1) };
    case "yesterday":
      return { start: addDays(today, -1), end: today };
    case "last7":
      return { start: addDays(today, -6), end: addDays(today, 1) };
    case "last30":
      return { start: addDays(today, -29), end: addDays(today, 1) };
    case "thisMonth":
      return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1) };
    case "lastMonth":
      return {
        start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        end: new Date(today.getFullYear(), today.getMonth(), 1),
      };
  }
}

export function formatRange(range: DateRange): string {
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
  const last = addDays(range.end, -1);
  return range.start.getTime() === last.getTime() ? fmt(range.start) : `${fmt(range.start)} - ${fmt(last)}`;
}

export function callTime(call: ReportCall): Date {
  return new Date(call.startedAt || call.created_at);
}

export function isInbound(call: ReportCall): boolean {
  return String(call.direction ?? "").toUpperCase() === "INBOUND";
}

const NOT_CONNECTED = new Set(["NO_ANSWER", "BUSY", "FAILED", "IN_PROGRESS"]);

export function isConnected(call: ReportCall): boolean {
  return call.durationSeconds > 0 && !NOT_CONNECTED.has(String(call.status ?? "").toUpperCase());
}

export function isConversation(call: ReportCall, thresholdSeconds: number): boolean {
  return !isInbound(call) && isConnected(call) && call.durationSeconds >= thresholdSeconds;
}

export function agentOf(call: ReportCall): string {
  return call.createdBy?.name?.trim() || "Unknown";
}

export function filterCalls(calls: ReportCall[], range: DateRange, member: string | null): ReportCall[] {
  return calls.filter((c) => {
    const t = callTime(c).getTime();
    if (Number.isNaN(t) || t < range.start.getTime() || t >= range.end.getTime()) return false;
    return !member || agentOf(c) === member;
  });
}

/** Time buckets for charts and tables: days for short ranges, weeks beyond two weeks. */
export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export function bucketsFor(range: DateRange): Bucket[] {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS);
  const step = days > 14 ? 7 : 1;
  const out: Bucket[] = [];
  for (let start = range.start; start < range.end; start = addDays(start, step)) {
    const end = addDays(start, step) < range.end ? addDays(start, step) : range.end;
    const label = `${start.getMonth() + 1}/${start.getDate()}`;
    out.push({ key: start.toISOString(), label: step === 1 ? label : `Wk ${label}`, start, end });
  }
  return out;
}

export function bucketIndex(buckets: Bucket[], call: ReportCall): number {
  const t = callTime(call).getTime();
  return buckets.findIndex((b) => t >= b.start.getTime() && t < b.end.getTime());
}

export interface Totals {
  outbound: number;
  inbound: number;
  connected: number;
  conversations: number;
  outboundMinutes: number;
  inboundMinutes: number;
  avgConnectedSeconds: number;
  positive: number;
  negative: number;
  appointments: number;
}

export function totalsFor(calls: ReportCall[], thresholdSeconds: number): Totals {
  let outbound = 0, inbound = 0, connected = 0, conversations = 0, outSec = 0, inSec = 0, connectedSec = 0;
  let positive = 0, negative = 0, appointments = 0;
  for (const c of calls) {
    const inb = isInbound(c);
    if (inb) inbound++;
    else outbound++;
    if (isConnected(c)) {
      connected++;
      connectedSec += c.durationSeconds;
      if (inb) inSec += c.durationSeconds;
      else outSec += c.durationSeconds;
    }
    if (isConversation(c, thresholdSeconds)) conversations++;
    const type = dispositionTypeOfStatus(c.status);
    if (type === "positive") positive++;
    if (type === "negative") negative++;
    if (String(c.status).toUpperCase() === "APPOINTMENT_SET") appointments++;
  }
  return {
    outbound,
    inbound,
    connected,
    conversations,
    outboundMinutes: outSec / 60,
    inboundMinutes: inSec / 60,
    avgConnectedSeconds: connected ? connectedSec / connected : 0,
    positive,
    negative,
    appointments,
  };
}

/** Per-bucket series for the Calls & Conversations and Time Spent charts. */
export function dailySeries(calls: ReportCall[], buckets: Bucket[], thresholdSeconds: number) {
  const zero = () => buckets.map(() => 0);
  const outbound = zero(), inbound = zero(), conversations = zero(), outboundMinutes = zero(), inboundMinutes = zero();
  for (const c of calls) {
    const i = bucketIndex(buckets, c);
    if (i < 0) continue;
    if (isInbound(c)) inbound[i]++;
    else outbound[i]++;
    if (isConversation(c, thresholdSeconds)) conversations[i]++;
    if (isConnected(c)) {
      if (isInbound(c)) inboundMinutes[i] += c.durationSeconds / 60;
      else outboundMinutes[i] += c.durationSeconds / 60;
    }
  }
  return { outbound, inbound, conversations, outboundMinutes, inboundMinutes };
}

/** Member x bucket counts (Calls Made / Outbound Conversations tables). */
export function memberGrid(
  calls: ReportCall[],
  buckets: Bucket[],
  include: (call: ReportCall) => boolean,
): { member: string; counts: number[]; total: number }[] {
  const rows = new Map<string, number[]>();
  for (const c of calls) {
    if (!include(c)) continue;
    const i = bucketIndex(buckets, c);
    if (i < 0) continue;
    const member = agentOf(c);
    if (!rows.has(member)) rows.set(member, buckets.map(() => 0));
    rows.get(member)![i]++;
  }
  return [...rows.entries()]
    .map(([member, counts]) => ({ member, counts, total: counts.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total || a.member.localeCompare(b.member));
}

export interface MemberStats extends Totals {
  member: string;
}

export function teamStats(calls: ReportCall[], thresholdSeconds: number): MemberStats[] {
  const byMember = new Map<string, ReportCall[]>();
  for (const c of calls) {
    const m = agentOf(c);
    if (!byMember.has(m)) byMember.set(m, []);
    byMember.get(m)!.push(c);
  }
  return [...byMember.entries()]
    .map(([member, list]) => ({ member, ...totalsFor(list, thresholdSeconds) }))
    .sort((a, b) => b.outbound - a.outbound || a.member.localeCompare(b.member));
}

export type HealthLevel = "good" | "watch" | "risk" | "low-data";

export interface NumberHealth {
  number: string;
  calls: number;
  connected: number;
  connectRate: number;
  conversations: number;
  noAnswer: number;
  badOrWrong: number;
  lastUsed: Date | null;
  health: HealthLevel;
}

/** Below this many calls a connect rate says nothing about the number. */
export const MIN_CALLS_FOR_HEALTH = 10;

export function healthFor(calls: number, connectRate: number): HealthLevel {
  if (calls < MIN_CALLS_FOR_HEALTH) return "low-data";
  if (connectRate >= 0.2) return "good";
  if (connectRate >= 0.1) return "watch";
  return "risk";
}

/** Outbound performance per caller-ID number. */
export function numberHealth(calls: ReportCall[], thresholdSeconds: number): NumberHealth[] {
  const byNumber = new Map<string, ReportCall[]>();
  for (const c of calls) {
    if (isInbound(c)) continue;
    const n = c.fromNumber?.trim() || "Unknown";
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n)!.push(c);
  }
  return [...byNumber.entries()]
    .map(([number, list]) => {
      const connected = list.filter(isConnected).length;
      const connectRate = list.length ? connected / list.length : 0;
      const statuses = list.map((c) => String(c.status ?? "").toUpperCase());
      const lastUsed = list.reduce<Date | null>((latest, c) => {
        const t = callTime(c);
        return !latest || t > latest ? t : latest;
      }, null);
      return {
        number,
        calls: list.length,
        connected,
        connectRate,
        conversations: list.filter((c) => isConversation(c, thresholdSeconds)).length,
        noAnswer: statuses.filter((s) => s === "NO_ANSWER").length,
        badOrWrong: statuses.filter((s) => s === "BAD_NUMBER" || s === "WRONG_NUMBER").length,
        lastUsed,
        health: healthFor(list.length, connectRate),
      };
    })
    .sort((a, b) => b.calls - a.calls);
}

export interface DispositionRow {
  status: string;
  label: string;
  type: DispositionType | null;
  count: number;
  share: number;
  avgSeconds: number;
}

/** Count and average length per disposition, WAVV's list first, then older statuses. */
export function dispositionBreakdown(calls: ReportCall[]): DispositionRow[] {
  const groups = new Map<string, ReportCall[]>();
  for (const c of calls) {
    const s = String(c.status ?? "UNKNOWN").toUpperCase();
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(c);
  }
  const order = DISPOSITIONS.map((d) => d.status as string);
  return [...groups.entries()]
    .map(([status, list]) => ({
      status,
      label: callStatusLabel(status),
      type: dispositionTypeOfStatus(status),
      count: list.length,
      share: calls.length ? list.length / calls.length : 0,
      avgSeconds: list.reduce((sum, c) => sum + c.durationSeconds, 0) / list.length,
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.status), ib = order.indexOf(b.status);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return b.count - a.count;
    });
}

/** Calls per weekday (0 = Sunday) x hour (0-23). */
export function heatmap(calls: ReportCall[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const c of calls) {
    const t = callTime(c);
    if (!Number.isNaN(t.getTime())) grid[t.getDay()][t.getHours()]++;
  }
  return grid;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
  const h = Math.floor(minutes / 60);
  return `${h}h ${Math.round(minutes % 60)}m`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
