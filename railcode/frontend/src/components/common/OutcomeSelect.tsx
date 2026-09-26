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

export interface OutcomeOption {
  value: string;
  label: string;
  dotColor: string;
  bgTint: string;
  textColor: string;
}

export const OUTCOME_CONFIG: Record<string, OutcomeOption> = {
  answered: { value: "answered", label: "Answered", dotColor: "bg-emerald-500", bgTint: "bg-emerald-500/10", textColor: "text-emerald-700" },
  no_answer: { value: "no_answer", label: "No Answer", dotColor: "bg-gray-500", bgTint: "bg-gray-500/10", textColor: "text-gray-600" },
  busy: { value: "busy", label: "Busy", dotColor: "bg-red-500", bgTint: "bg-red-500/10", textColor: "text-red-700" },
  voicemail: { value: "voicemail", label: "Voicemail", dotColor: "bg-amber-500", bgTint: "bg-amber-500/10", textColor: "text-amber-700" },
  dnc: { value: "dnc", label: "DNC", dotColor: "bg-rose-500", bgTint: "bg-rose-500/10", textColor: "text-rose-700" },
  wrong_number: { value: "wrong_number", label: "Wrong Number", dotColor: "bg-gray-400", bgTint: "bg-gray-400/10", textColor: "text-gray-600" },
  disconnected: { value: "disconnected", label: "Disconnected", dotColor: "bg-gray-400", bgTint: "bg-gray-400/10", textColor: "text-gray-600" },
};

interface OutcomeSelectProps {
  value?: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
}

export function OutcomeSelect({ value = "no_answer", onChange, disabled }: OutcomeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = OUTCOME_CONFIG[value] || OUTCOME_CONFIG.no_answer;
  const pendingRef = useRef<string | null>(null);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "top-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const handleOptionClick = (optionValue: string) => {
    pendingRef.current = optionValue;
    setIsOpen(false);
  };

  // Fire onChange when menu closes
  useEffect(() => {
    if (!isOpen && pendingRef.current) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [isOpen, onChange]);

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`h-8 inline-flex items-center gap-2 px-2.5 rounded-[4px] text-[12px] font-medium border border-[var(--ods-border)] ${current.bgTint} ${current.textColor} hover:brightness-95 transition-all select-none w-full justify-between`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />
          <span>{current.label}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[60] w-44 py-1 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg flex flex-col gap-0.5 select-none"
          >
            {Object.values(OUTCOME_CONFIG).map((option) => (
              <div
                key={option.value}
                onClick={() => handleOptionClick(option.value)}
                className={`h-7 px-2.5 mx-1 rounded-[4px] flex items-center gap-2 text-[12px] cursor-pointer transition-colors ${
                  option.value === value
                    ? "bg-[var(--ods-bg-secondary)] font-medium text-[var(--ods-text-primary)]"
                    : "text-[var(--ods-text-secondary)] hover:bg-[var(--ods-bg-secondary)] hover:text-[var(--ods-text-primary)]"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${option.dotColor}`} />
                <span>{option.label}</span>
              </div>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
