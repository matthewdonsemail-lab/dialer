import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useFloating, autoUpdate, offset, flip, shift, FloatingPortal } from "@floating-ui/react";

interface Campaign {
  id: string;
  name: string;
}

interface CampaignSelectorProps {
  campaigns: Campaign[];
  currentCampaignId?: string | null;
  onSelect: (campaignId: string | null) => void;
  onClose?: () => void;
}

export function CampaignSelector({ campaigns, currentCampaignId, onSelect, onClose }: CampaignSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted: autoUpdate,
  });

  const handleSelect = (campaignId: string | null) => {
    onSelect(campaignId);
    setIsOpen(false);
    onClose?.();
  };

  const currentCampaign = campaigns.find(c => c.id === currentCampaignId);

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-[12px] text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)] hover:bg-[var(--ods-bg-secondary)] rounded transition-colors"
      >
        <span className="truncate max-w-[120px]">
          {currentCampaign?.name || "No Campaign"}
        </span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[100] w-48 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg py-1 text-[12px]"
          >
            <button
              onClick={() => handleSelect(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${!currentCampaignId ? 'bg-[var(--ods-bg-secondary)]' : 'hover:bg-[var(--ods-bg-secondary)]'}`}
            >
              {currentCampaignId && <Check className="w-3.5 h-3.5 text-[var(--ods-brand-600)]" />}
              <span className={!currentCampaignId ? 'font-medium' : ''}>No Campaign</span>
            </button>
            
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => handleSelect(campaign.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${currentCampaignId === campaign.id ? 'bg-[var(--ods-bg-secondary)]' : 'hover:bg-[var(--ods-bg-secondary)]'}`}
              >
                {currentCampaignId === campaign.id && <Check className="w-3.5 h-3.5 text-[var(--ods-brand-600)]" />}
                <span className={currentCampaignId === campaign.id ? 'font-medium' : ''}>{campaign.name}</span>
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
