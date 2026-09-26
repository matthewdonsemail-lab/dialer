import React from "react";
import { useLeads } from "@/hooks/useLeads";
import { useCallLogs } from "@/hooks/useCallLogs";
import {
  Users,
  Phone,
  Clock,
  CheckCircle,
  TrendingUp,
  Activity,
} from "lucide-react";
import { PageCanvas } from "@/components/common/PageCanvas";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Spokes } from "@/components/ui/Spinner";

export function DashboardPage() {
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: callLogs, isLoading: logsLoading } = useCallLogs();

  const totalLeads = leads?.length ?? 0;
  const newLeads = leads?.filter((l) => l.status === "new").length ?? 0;
  const contactedLeads = leads?.filter((l) => l.status === "contacted").length ?? 0;
  const interestedLeads = leads?.filter((l) => l.status === "interested").length ?? 0;
  const convertedLeads = leads?.filter((l) => l.status === "converted").length ?? 0;
  const totalCalls = callLogs?.length ?? 0;
  const answeredCalls = (callLogs ?? []).filter((l) => l.outcome === "answered").length ?? 0;
  const avgDuration =
    totalCalls > 0 && callLogs
      ? Math.round(
          callLogs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0) /
            totalCalls
        )
      : 0;

  const stats = [
    { label: "Total Leads", value: totalLeads, icon: Users },
    { label: "New Today", value: newLeads, icon: TrendingUp },
    { label: "Interested", value: interestedLeads, icon: CheckCircle },
    { label: "Total Calls", value: totalCalls, icon: Phone },
    { label: "Answered", value: answeredCalls, icon: Activity },
    { label: "Avg Duration", value: `${avgDuration}s`, icon: Clock },
  ];

  if (leadsLoading || logsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spokes className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  return (
    <PageCanvas title="Dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <WidgetCard key={stat.label} className="p-3">
              <div className="flex items-center gap-2 mb-2">
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
        <WidgetCard title="Lead Status Distribution">
          <div className="space-y-2">
            {[
              { label: "New", count: newLeads, color: "bg-blue-500" },
              { label: "Contacted", count: contactedLeads, color: "bg-indigo-500" },
              { label: "Interested", count: interestedLeads, color: "bg-amber-500" },
              { label: "Not Interested", count: (leads ?? []).filter((l) => l.status === "not_interested").length, color: "bg-gray-400" },
              { label: "Converted", count: convertedLeads, color: "bg-emerald-500" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                <span className="flex-1 text-[12px] text-[var(--ods-text-secondary)]">{item.label}</span>
                <span className="text-[12px] font-semibold text-[var(--ods-text-primary)]">{item.count}</span>
              </div>
            ))}
          </div>
        </WidgetCard>

        <WidgetCard title="Recent Activity">
          {callLogs?.length === 0 ? (
            <p className="text-[12px] text-[var(--ods-text-secondary)]">No call activity yet</p>
          ) : (
            <div className="space-y-2">
              {(callLogs ?? [])
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 5)
                .map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 p-2 rounded-[4px] bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--ods-text-primary)] truncate">
                        {log.outcome}
                      </p>
                      <p className="text-[11px] text-[var(--ods-text-tertiary)]">
                        {log.duration_seconds}s
                      </p>
                    </div>
                    <span className="text-[11px] text-[var(--ods-text-tertiary)]">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </WidgetCard>
      </div>
    </PageCanvas>
  );
}
