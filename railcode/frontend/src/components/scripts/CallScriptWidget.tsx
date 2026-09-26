import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ChevronLeft, HelpCircle } from "lucide-react";
import { useScripts, Script } from "@/hooks/useScripts";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { Badge } from "@/components/ui/Badge";
import { Spokes } from "@/components/ui/Spinner";

interface CallScriptWidgetProps {
  campaignId?: string | null;
}

export function CallScriptWidget({ campaignId }: CallScriptWidgetProps) {
  const [activeObjection, setActiveObjection] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const { data: scripts, isLoading } = useScripts();

  const campaignScripts = scripts?.filter((s: Script) => s.campaignId === campaignId) || [];
  const selectedScript = campaignScripts.find((s: Script) => s.id === selectedScriptId) || null;

  // WidgetCard has h-[460px] with header ~32px and padding 24px
  // Available scroll height: 460 - 32 - 24 = 404px
  const scrollMaxHeight = "max-h-[404px]";

  if (isLoading) {
    return (
      <WidgetCard title="Call Script" icon={BookOpen} className="h-[460px]">
        <div className="flex items-center justify-center h-full">
          <Spokes className="w-5 h-5 text-[var(--ods-brand-600)]" />
        </div>
      </WidgetCard>
    );
  }

  if (campaignScripts.length === 0) {
    return (
      <WidgetCard title="Call Script" icon={BookOpen} className="h-[460px]">
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <BookOpen className="w-8 h-8 text-[var(--ods-text-tertiary)] opacity-40 mb-2" />
          <p className="text-[13px] text-[var(--ods-text-secondary)]">No scripts available</p>
        </div>
      </WidgetCard>
    );
  }

  if (selectedScript) {
    const objections = Object.entries(selectedScript.scriptData?.objection_responses ?? {});
    const content = selectedScript.scriptData?.content || "";
    const category = selectedScript.scriptData?.category || "General";

    return (
      <WidgetCard
        title={selectedScript.name || "Call Script"}
        icon={BookOpen}
        action={<Badge variant="blue">{category}</Badge>}
        className="h-[460px]"
      >
        <div className={`overflow-y-auto ${scrollMaxHeight}`}>
          <button
            onClick={() => {
              setSelectedScriptId(null);
              setActiveObjection(null);
            }}
            className="flex items-center gap-1 px-2 py-1.5 mb-3 text-[12px] text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] rounded-[4px] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to scripts
          </button>
          {content && (
            <div className="mb-3 p-3 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px]">
              <p className="text-[13px] leading-relaxed text-[var(--ods-text-primary)] whitespace-pre-wrap">
                {content}
              </p>
            </div>
          )}
          {objections.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <HelpCircle className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                  Objection Rebuttals
                </span>
              </div>
              <div className="space-y-1.5">
                {objections.map(([objection, data]: [string, any]) => {
                  const isOpen = activeObjection === objection;
                  return (
                    <div key={objection} className="border border-[var(--ods-border)] rounded-[6px] overflow-hidden bg-[var(--ods-bg-primary)]">
                      <button
                        type="button"
                        onClick={() => setActiveObjection(isOpen ? null : objection)}
                        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-[var(--ods-bg-secondary)] transition text-[12px]"
                      >
                        <span className="font-medium text-[var(--ods-text-primary)]">"{objection}"</span>
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />}
                      </button>
                      {isOpen && (
                        <div className="p-2.5 bg-[var(--ods-bg-secondary)] border-t border-[var(--ods-border)] text-[12px] leading-relaxed text-[var(--ods-text-secondary)]">
                          {typeof data === "string" ? data : data?.response}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title="Call Script" icon={BookOpen} className="h-[460px]">
      <div className={`overflow-y-auto ${scrollMaxHeight}`}>
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] mb-3">
          Select a script
        </p>
        <div className="space-y-2">
          {campaignScripts.map((script: Script) => (
            <button
              key={script.id}
              onClick={() => setSelectedScriptId(script.id)}
              className="w-full text-left p-3 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] hover:border-[var(--ods-brand-500)] hover:bg-[var(--ods-bg-secondary)] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
                  <span className="text-[13px] font-medium text-[var(--ods-text-primary)]">{script.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--ods-text-tertiary)]" />
              </div>
              {script.scriptData?.category && (
                <div className="mt-1.5">
                  <Badge variant="gray" className="text-[10px]">{script.scriptData.category}</Badge>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </WidgetCard>
  );
}
