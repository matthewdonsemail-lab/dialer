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

export interface StatusOption {
  value: string;
  label: string;
  dotColor: string;
  bgTint: string;
  textColor: string;
}

interface StatusSelectProps {
  value?: string;
  onChange: (newValue: string) => void;
  disabled?: boolean;
  options: StatusOption[];
}

export function StatusSelect({ value, onChange, disabled, options }: StatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  const pendingRef = useRef<string | null>(null);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const handleOptionClick = (optionValue: string) => {
    pendingRef.current = optionValue;
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen && pendingRef.current) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [isOpen, onChange]);

  if (!current || options.length === 0) return null;

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`h-5 inline-flex items-center gap-1.5 px-2 rounded-[4px] text-[11px] font-medium border border-[var(--ods-border)] ${current.bgTint} ${current.textColor} hover:brightness-95 transition-all select-none`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.dotColor}`} />
        <span>{current.label}</span>
        <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[60] w-40 py-1 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg flex flex-col gap-0.5 select-none"
          >
            {options.map((option) => (
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
