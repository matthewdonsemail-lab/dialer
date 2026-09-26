import React from "react";
import { useLeads } from "@/hooks/useLeads";
import { useCallLogs } from "@/hooks/useCallLogs";
import { BarChart3, Users, Phone, TrendingUp, Clock } from "lucide-react";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";

export function AdminPage() {
  const { data: leads } = useLeads();
  const { data: callLogs } = useCallLogs();

  const totalLeads = leads?.length ?? 0;
  const newLeads = leads?.filter((l) => l.status === "new").length ?? 0;
  const totalCalls = callLogs?.length ?? 0;
  const answeredCalls = (callLogs ?? []).filter((l) => l.outcome === "answered").length ?? 0;
  const avgDuration =
    totalCalls > 0
      ? Math.round(
          (callLogs ?? []).reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0) / totalCalls
        )
      : 0;
  const conversionRate =
    totalLeads > 0
      ? Math.round(((leads?.filter((l) => l.status === "converted").length ?? 0) / totalLeads) * 100)
      : 0;

  const statusBreakdown = [
    { label: "New", count: newLeads, color: "bg-blue-500" },
    { label: "Contacted", count: leads?.filter((l) => l.status === "contacted").length ?? 0, color: "bg-indigo-500" },
    { label: "Interested", count: leads?.filter((l) => l.status === "interested").length ?? 0, color: "bg-amber-500" },
    { label: "Converted", count: leads?.filter((l) => l.status === "converted").length ?? 0, color: "bg-green-500" },
    { label: "DNC", count: leads?.filter((l) => l.status === "do_not_contact").length ?? 0, color: "bg-red-500" },
  ];

  const outcomeBreakdown = [
    { label: "Answered", count: answeredCalls, color: "bg-emerald-500" },
    { label: "No Answer", count: (callLogs ?? []).filter((l) => l.outcome === "no_answer").length ?? 0, color: "bg-gray-400" },
    { label: "Busy", count: (callLogs ?? []).filter((l) => l.outcome === "busy").length ?? 0, color: "bg-red-400" },
    { label: "Voicemail", count: (callLogs ?? []).filter((l) => l.outcome === "voicemail").length ?? 0, color: "bg-amber-400" },
  ];

  const maxOutcome = Math.max(...outcomeBreakdown.map((o) => o.count), 1);

  return (
    <PageCanvas
      title="Administration"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Leads", value: totalLeads, icon: Users },
          { label: "New Leads", value: newLeads, icon: TrendingUp },
          { label: "Total Calls", value: totalCalls, icon: Phone },
          { label: "Avg Duration", value: `${avgDuration}s`, icon: Clock },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: BarChart3 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <WidgetCard key={stat.label} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
              </div>
              <p className="text-[20px] font-semibold text-[var(--ods-text-primary)]">{stat.value}</p>
              <p className="text-[11px] font-medium text-[var(--ods-text-tertiary)] uppercase tracking-wider mt-1">
                {stat.label}
              </p>
            </WidgetCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WidgetCard title="Call Outcomes">
          <div className="space-y-2">
            {outcomeBreakdown.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="w-20 text-[12px] text-[var(--ods-text-secondary)]">{item.label}</span>
                <div className="flex-1 bg-[var(--ods-bg-primary)] rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all`}
                    style={{ width: `${(item.count / maxOutcome) * 100}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-[var(--ods-text-primary)] w-8 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Lead Status Breakdown">
          <div className="space-y-2">
            {statusBreakdown.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="flex-1 text-[12px] text-[var(--ods-text-secondary)]">{item.label}</span>
                <span className="text-[12px] font-semibold text-[var(--ods-text-primary)]">{item.count}</span>
              </div>
            ))}
          </div>
        </WidgetCard>
      </div>
    </PageCanvas>
  );
}
