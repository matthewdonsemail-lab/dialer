import React, { useState, useRef, useEffect } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
} from "@floating-ui/react";
import { ChevronDown } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
}

interface CampaignSelectProps {
  campaigns?: Campaign[];
  value?: string | null;
  onChange: (campaignId: string | null) => void;
}

export function CampaignSelect({ campaigns, value, onChange }: CampaignSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pendingRef = useRef<string | null>(null);

  const currentCampaign = campaigns?.find(c => c.id === value);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const handleOptionClick = (campaignId: string | null) => {
    pendingRef.current = campaignId;
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen && pendingRef.current !== null) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [isOpen, onChange]);

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => setIsOpen(!isOpen)}
        className={`h-5 inline-flex items-center gap-1.5 px-2 rounded-[4px] text-[11px] font-medium border border-[var(--ods-border)] bg-[var(--ods-bg-secondary)] text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-tertiary)] transition-all select-none`}
      >
        <span className="truncate max-w-[100px]">
          {currentCampaign?.name || "—"}
        </span>
        <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[60] w-40 py-1 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg flex flex-col gap-0.5 select-none max-h-60 overflow-y-auto"
          >
            <div
              onClick={() => handleOptionClick(null)}
              className={`h-7 px-2.5 mx-1 rounded-[4px] flex items-center gap-2 text-[12px] cursor-pointer transition-colors ${
                !value
                  ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
                  : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
              }`}
            >
              <span>—</span>
            </div>
            
            {campaigns?.map((campaign) => (
              <div
                key={campaign.id}
                onClick={() => handleOptionClick(campaign.id)}
                className={`h-7 px-2.5 mx-1 rounded-[4px] flex items-center gap-2 text-[12px] cursor-pointer transition-colors ${
                  campaign.id === value
                    ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
                    : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
                }`}
              >
                <span className="truncate">{campaign.name}</span>
              </div>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
