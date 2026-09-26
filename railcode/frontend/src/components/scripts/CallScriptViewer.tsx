import React, { useState } from "react";
import { X, BookOpen, AlertTriangle } from "lucide-react";
import { useScripts, Script } from "@/hooks/useScripts";

interface CallScriptViewerProps {
  onClose: () => void;
  campaignId?: string | null;
}

export function CallScriptViewer({ onClose, campaignId }: CallScriptViewerProps) {
  const [activeObjection, setActiveObjection] = useState<string | null>(null);
  
  // Fetch scripts and find the one for this campaign
  const { data: scripts, isLoading } = useScripts();
  
  const script = scripts?.find((s: Script) => s.campaignId === campaignId) || null;

  if (!script) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-[var(--ods-bg-primary)] rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--ods-border)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ods-border)]">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--ods-brand-600)]" />
              <h2 className="text-base font-semibold text-[var(--ods-text-primary)]">Call Script</h2>
            </div>
            <button onClick={onClose} className="text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 text-center">
            <p className="text-[13px] text-[var(--ods-text-secondary)]">No script found for this campaign</p>
          </div>
        </div>
      </div>
    );
  }

  const objections = Object.entries(script.scriptData?.objection_responses ?? {});
  const content = script.scriptData?.content || "";
  const category = script.scriptData?.category || "General";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--ods-bg-primary)] rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-[var(--ods-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ods-border)]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--ods-brand-600)]" />
            <h2 className="text-base font-semibold text-[var(--ods-text-primary)]">{script.name}</h2>
          </div>
          <button onClick={onClose} className="text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-5 space-y-5">
          {/* Category Badge */}
          <span className="inline-block px-2.5 py-0.5 rounded-[4px] text-xs font-semibold bg-[var(--ods-brand-500)/10] text-[var(--ods-brand-700)] border border-[var(--ods-brand-500)/20]">
            {category}
          </span>
          
          {/* Script Content */}
          {content && (
            <div className="bg-[var(--ods-bg-secondary)] rounded-lg p-4 border border-[var(--ods-border)]">
              <p className="text-[var(--ods-text-primary)] leading-relaxed whitespace-pre-wrap">
                {content}
              </p>
            </div>
          )}
          
          {/* Objections & Responses */}
          {objections.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--ods-text-primary)] mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--ods-amber-500)]" />
                Common Objections & Responses
              </h3>
              <div className="space-y-2">
                {objections.map(([objection, data]: [string, any]) => (
                  <div key={objection}>
                    <button
                      onClick={() => setActiveObjection(activeObjection === objection ? null : objection)}
                      className="w-full text-left p-3 rounded-lg border border-[var(--ods-border)] hover:border-[var(--ods-brand-300)] hover:bg-[var(--ods-brand-50)] transition text-sm"
                    >
                      <span className="font-medium text-[var(--ods-text-primary)]">"{objection}"</span>
                      <span className="text-xs text-[var(--ods-text-tertiary)] ml-2">{data.category}</span>
                    </button>
                    {activeObjection === objection && (
                      <div className="mt-2 p-3 bg-[var(--ods-brand-50)] rounded-lg border border-[var(--ods-brand-200)] text-sm text-[var(--ods-text-primary)]">
                        {data.response}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
