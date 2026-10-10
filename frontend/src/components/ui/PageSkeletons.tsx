import React, { useLayoutEffect, useRef, useState } from "react";
import { Skeleton, TableSkeletonRows } from "./Skeleton";
import { useEvenColumns } from "@/hooks/use-even-columns";

/*
 * Page skeletons. Each one is built from the same sizes as the real
 * components (StatTiles, ReportCard, TabBar, DataTable toolbar, WidgetCard),
 * so when data arrives the content drops into place without the layout
 * jumping. Pages use the matching skeleton for their own loading state and
 * App uses them as route fallbacks while a page's code downloads.
 */

/** Same grid and tile shape as ReportParts StatTiles. */
export function StatTilesSkeleton({ count = 6 }: { count?: number }) {
  const grid = useEvenColumns(count);
  return (
    <div ref={grid.ref} style={grid.style} className="grid gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 min-h-[112px] flex flex-col">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-9 h-9 rounded-[8px]" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="ml-auto h-4 w-4 rounded-md" />
          </div>
          <Skeleton className="mt-auto h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

type CardBody = "chart" | "table" | "lines" | "heatmap" | "player";

/** Same frame as ReportCard: text-xl title + pill + eye, then a body of the given kind. */
export function ReportCardSkeleton({ body = "lines", rows = 5, className = "" }: { body?: CardBody; rows?: number; className?: string }) {
  return (
    <section className={`rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-4 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-2 mb-4 h-7">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-16 rounded-md" />
        <Skeleton className="h-4 w-4 rounded-md" />
      </div>
      {body === "chart" && (
        <div className="h-[220px] flex items-end gap-2 px-6 pb-6 border-b border-l border-[var(--ods-border)]">
          {[45, 70, 30, 85, 55, 65, 40].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-[4px] rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
      )}
      {body === "table" && (
        <table className="w-full border-separate border-spacing-0">
          <tbody>
            <tr className="h-9">
              {Array.from({ length: 4 }, (_, c) => (
                <td key={c} className="px-3 border-y border-r first:border-l border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
                  <Skeleton className="h-3 w-16" />
                </td>
              ))}
            </tr>
            <TableSkeletonRows rows={rows} columns={4} bordered />
          </tbody>
        </table>
      )}
      {body === "lines" && (
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className={`h-3.5 ${["w-11/12", "w-4/5", "w-full", "w-2/3", "w-3/4"][i % 5]}`} />
          ))}
        </div>
      )}
      {body === "heatmap" && (
        <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
          {Array.from({ length: 8 * 12 }, (_, i) => (i % 8 === 0 ? <span key={i} /> : <Skeleton key={i} className="h-[10px] rounded-[2px]" />))}
        </div>
      )}
      {body === "player" && <Skeleton className="h-16 w-full rounded-[8px]" />}
    </section>
  );
}

/**
 * Same container and tab size as TabBar, including its width-based modes
 * (roomy row / tight stacked / narrow icon), so the bar does not change
 * height when the real one replaces it.
 */
export function TabBarSkeleton({ tabs }: { tabs: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [perTab, setPerTab] = useState(200);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPerTab(el.clientWidth / Math.max(1, tabs));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs]);
  const mode = perTab >= 150 ? "roomy" : perTab >= 64 ? "tight" : "narrow";
  return (
    <div ref={ref} className="flex gap-1 p-1 rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)]" aria-hidden="true">
      {Array.from({ length: tabs }, (_, i) => (
        <div
          key={i}
          className={`flex-1 rounded-[8px] flex items-center justify-center ${mode === "tight" ? "flex-col gap-1 h-12" : "gap-2 h-10"}`}
        >
          <Skeleton className="h-4 w-4" />
          {mode === "roomy" && <Skeleton className="h-3.5 w-20" />}
          {mode === "tight" && <Skeleton className="h-2.5 w-12" />}
        </div>
      ))}
    </div>
  );
}

/** Header of Reports / Admin / Settings: text-xl title, pill, eye, optional pickers on the right. */
function PageHeaderSkeleton({ pickers = 0 }: { pickers?: number }) {
  return (
    <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
      <div className="flex items-center gap-2 h-11">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-4 w-4 rounded-md" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: pickers }, (_, i) => (
          <Skeleton key={i} className="h-11 w-[200px] rounded-[8px]" />
        ))}
      </div>
    </div>
  );
}

/** Body layouts of the Reports tabs (header and tabs are already on screen). */
export function ReportsBodySkeleton({ tab }: { tab: "overview" | "numbers" | "team" | "dispositions" }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <StatTilesSkeleton />
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCardSkeleton body="chart" />
            <ReportCardSkeleton body="chart" />
          </div>
          <ReportCardSkeleton body="table" rows={4} />
        </>
      )}
      {tab === "numbers" && <ReportCardSkeleton body="table" rows={6} />}
      {tab === "team" && (
        <>
          <ReportCardSkeleton body="chart" />
          <ReportCardSkeleton body="table" rows={4} />
        </>
      )}
      {tab === "dispositions" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCardSkeleton body="chart" />
            <ReportCardSkeleton body="chart" />
          </div>
          <ReportCardSkeleton body="table" rows={5} />
        </>
      )}
    </div>
  );
}

/** Body layouts of the Admin tabs. */
export function AdminBodySkeleton({ tab }: { tab: "overview" | "activity" | "team" | "objects" }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      {tab !== "activity" && <StatTilesSkeleton />}
      {tab === "overview" && (
        <>
          <ReportCardSkeleton body="chart" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ReportCardSkeleton body="chart" />
            <ReportCardSkeleton body="table" rows={6} />
          </div>
        </>
      )}
      {tab === "activity" && <ReportCardSkeleton body="table" rows={10} />}
      {tab === "team" && (
        <>
          <ReportCardSkeleton body="chart" />
          <ReportCardSkeleton body="table" rows={4} />
        </>
      )}
      {tab === "objects" && <ReportCardSkeleton body="table" rows={7} />}
    </div>
  );
}

/** Whole Reports-style page (header, tab bar, tiles, cards). Route fallback for Reports, Admin, Settings. */
export function ReportStylePageSkeleton({ tabs = 4, pickers = 1, settings = false }: { tabs?: number; pickers?: number; settings?: boolean }) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--ods-bg-secondary)]" role="status" aria-label="Loading">
      <PageHeaderSkeleton pickers={pickers} />
      <div className="px-5">
        <TabBarSkeleton tabs={tabs} />
      </div>
      <div className={`p-5 space-y-4 ${settings ? "max-w-5xl w-full" : ""}`}>
        {settings ? (
          <ReportCardSkeleton body="lines" rows={6} />
        ) : (
          <>
            <StatTilesSkeleton />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ReportCardSkeleton body="chart" />
              <ReportCardSkeleton body="chart" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Same toolbar, header row and rows as DataTable. Route fallback for Contacts, Call History, Phone Numbers. */
export function TablePageSkeleton({ columns = 8, filters = 3 }: { columns?: number; filters?: number }) {
  return (
    <div className="flex flex-col h-full w-full bg-[var(--ods-bg-primary)]" role="status" aria-label="Loading">
      <div className="h-14 px-4 flex items-center gap-3 border-b border-[var(--ods-border)] shrink-0 overflow-hidden" aria-hidden="true">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-6 w-12 rounded-md" />
        <Skeleton className="h-8 w-44 rounded-[6px] ml-2" />
        {Array.from({ length: filters }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-[7px]" />
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        <table className="w-full border-separate border-spacing-0 table-fixed">
          <thead>
            <tr className="h-9">
              <th className="w-10 border-y border-r first:border-l border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]" />
              {Array.from({ length: columns }, (_, c) => (
                <th key={c} className="px-3 border-y border-r border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableSkeletonRows rows={30} columns={columns} leadingCheckbox bordered />
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Call review: back button, title + pill, position and arrows, five tabs, tiles, two columns of cards. */
export function CallReviewSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--ods-bg-secondary)]" role="status" aria-label="Loading call">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-[8px]" />
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-9 rounded-[8px]" />
          <Skeleton className="h-9 w-9 rounded-[8px]" />
        </div>
      </div>
      <div className="px-5">
        <TabBarSkeleton tabs={5} />
      </div>
      <div className="p-5 space-y-4">
        <StatTilesSkeleton />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ReportCardSkeleton body="table" rows={6} />
          <ReportCardSkeleton body="lines" rows={5} />
        </div>
      </div>
    </div>
  );
}

/** The right-hand side of the scripts workspace: script header, four tabs, tiles, cards, action bar. */
export function ScriptDetailSkeleton() {
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[var(--ods-bg-secondary)]" role="status" aria-label="Loading script">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 bg-[var(--ods-bg-primary)] border-b border-[var(--ods-border)]">
        <div className="flex items-center gap-2 h-10">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
        <Skeleton className="h-9 w-9 rounded-[8px]" />
      </div>
      <div className="px-5 pt-4">
        <TabBarSkeleton tabs={4} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-5 space-y-4">
        <StatTilesSkeleton />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ReportCardSkeleton body="table" rows={3} />
          <ReportCardSkeleton body="table" rows={3} />
        </div>
      </div>
      <div className="p-4 border-t border-[var(--ods-border)] bg-[var(--ods-bg-primary)] shrink-0">
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}

/** Scripts page: header bar, list column, detail. Route fallback for /scripts. */
export function ScriptsPageSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--ods-bg-primary)]" role="status" aria-label="Loading scripts">
      <div className="h-14 px-5 flex items-center gap-2.5 border-b border-[var(--ods-border)] shrink-0">
        <Skeleton className="w-8 h-8 rounded-[8px]" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-6 w-44 rounded-md" />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-80 shrink-0 border-r border-[var(--ods-border)] hidden md:flex flex-col">
          <div className="p-3 border-b border-[var(--ods-border)] flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-[8px]" />
            <Skeleton className="h-9 w-16 rounded-[8px]" />
          </div>
          <ScriptListSkeleton />
        </div>
        <ScriptDetailSkeleton />
      </div>
    </div>
  );
}

/** Rows of the scripts list: name + verdict, then campaign + call count. */
export function ScriptListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-4 py-3 border-b border-[var(--ods-border)] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className={`h-4 ${["w-40", "w-32", "w-44", "w-36"][i % 4]}`} />
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Contact workspace (/contacts/:id, /leads/:id): record card and field
 * folders on the left, the timeline with its composer in the middle, a
 * panel and the icon rail on the right.
 */
export function ContactWorkspaceSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" role="status" aria-label="Loading">
      <div className="hidden md:flex w-80 shrink-0 border-r border-[var(--ods-border)] flex-col bg-[var(--ods-bg-secondary)]">
        <div className="h-12 px-3 border-b border-[var(--ods-border)] flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <div className="p-3 space-y-3">
          <div className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
            <Skeleton className="h-6 w-28 rounded-md" />
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-md" />)}
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-[8px]" />
          {[5, 4, 3].map((rows, i) => (
            <div key={i} className="rounded-[10px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)]">
              <div className="h-10 px-3 flex items-center"><Skeleton className="h-4 w-24" /></div>
              <div className="px-3 pb-2 border-t border-[var(--ods-border)]">
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="py-2 space-y-1.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className={`h-4 ${["w-3/4", "w-1/2", "w-2/3"][r % 3]}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 px-4 border-b border-[var(--ods-border)] flex items-center justify-between">
          <div className="flex items-center gap-2"><Skeleton className="w-7 h-7 rounded-md" /><Skeleton className="h-4 w-40" /></div>
          <div className="flex gap-1.5"><Skeleton className="h-9 w-28 rounded-[8px]" /><Skeleton className="h-9 w-20 rounded-[8px]" /></div>
        </div>
        <div className="flex-1 bg-[var(--ods-bg-secondary)] p-4 space-y-3">
          <div className="flex justify-center"><Skeleton className="h-6 w-24 rounded-md" /></div>
          <div className="flex justify-center"><Skeleton className="h-8 w-72 rounded-md" /></div>
          <Skeleton className="h-28 w-full max-w-[560px] ml-auto rounded-[10px]" />
          <Skeleton className="h-20 w-full max-w-[560px] ml-auto rounded-[10px]" />
          <div className="flex justify-center"><Skeleton className="h-6 w-20 rounded-md" /></div>
          <Skeleton className="h-28 w-full max-w-[560px] ml-auto rounded-[10px]" />
        </div>
        <div className="border-t border-[var(--ods-border)] p-3 space-y-2">
          <Skeleton className="h-8 w-44 rounded-[8px]" />
          <Skeleton className="h-[74px] w-full rounded-[8px]" />
          <div className="flex justify-between"><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-40 rounded-[8px]" /></div>
        </div>
      </div>
      <div className="hidden xl:flex w-80 shrink-0 border-l border-[var(--ods-border)] flex-col">
        <div className="h-12 px-4 border-b border-[var(--ods-border)] flex items-center"><Skeleton className="h-4 w-28" /></div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[68px] rounded-[10px]" />)}
        </div>
      </div>
      <div className="hidden md:flex w-12 shrink-0 border-l border-[var(--ods-border)] flex-col items-center gap-1 py-2">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="w-9 h-9 rounded-[8px]" />)}
      </div>
    </div>
  );
}

/** App frame while sign-in is checked: sidebar rail + top bar + a neutral body, so nothing jumps when the app appears. */
export function AppShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--ods-bg-secondary)]" role="status" aria-label="Loading">
      <div className="w-14 md:w-56 shrink-0 border-r border-[var(--ods-border)] flex flex-col">
        <div className="h-12 border-b border-[var(--ods-border)] flex items-center gap-2 px-3">
          <Skeleton className="h-6 w-6 rounded-[6px]" />
          <Skeleton className="h-4 w-24 hidden md:block" />
        </div>
        <div className="px-2 py-3 space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-9 flex items-center gap-2.5 px-2.5">
              <Skeleton className="h-[18px] w-[18px]" />
              <Skeleton className="h-3.5 w-24 hidden md:block" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-10 border-b border-[var(--ods-border)] bg-[var(--ods-bg-primary)] flex items-center px-3">
          <Skeleton className="h-3.5 w-28" />
        </div>
        <ReportStylePageSkeleton />
      </div>
    </div>
  );
}

/** Centered card, for the sign-in / callback / sign-up screens. */
export function AuthCardSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--ods-bg-secondary)]" role="status" aria-label="Loading">
      <div className="w-full max-w-sm rounded-[12px] border border-[var(--ods-border)] bg-[var(--ods-bg-primary)] p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-11 w-full rounded-[8px]" />
        <Skeleton className="h-3 w-3/4 mx-auto" />
      </div>
    </div>
  );
}
