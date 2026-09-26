import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckSquare, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  message: string;
  detailedMessage?: string;
  variant?: ToastVariant;
  duration?: number;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (message: string, options?: Omit<ToastItem, "id" | "message">) => void;
  success: (message: string, detailedMessage?: string) => void;
  error: (message: string, detailedMessage?: string) => void;
  warning: (message: string, detailedMessage?: string) => void;
  info: (message: string, detailedMessage?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: React.ComponentType<{ className?: string }>; color: string; barBg: string }
> = {
  success: {
    icon: CheckSquare,
    color: "text-emerald-500 dark:text-emerald-400",
    barBg: "bg-emerald-500/10 dark:bg-emerald-400/10",
  },
  error: {
    icon: AlertTriangle,
    color: "text-red-500 dark:text-red-400",
    barBg: "bg-red-500/10 dark:bg-red-400/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500 dark:text-amber-400",
    barBg: "bg-amber-500/10 dark:bg-amber-400/10",
  },
  info: {
    icon: Info,
    color: "text-blue-500 dark:text-blue-400",
    barBg: "bg-blue-500/10 dark:bg-blue-400/10",
  },
};

const SingleToast = ({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (id: string) => void;
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const duration = item.duration ?? 5000;
  const variant = item.variant ?? "info";
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  useEffect(() => {
    if (isPaused) return;
    const timer = setTimeout(() => onClose(item.id), duration);
    return () => clearTimeout(timer);
  }, [item.id, duration, isPaused, onClose]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative w-[296px] overflow-hidden rounded-[6px] border border-[var(--ods-border,#e5e5ea)] dark:border-[#313136] bg-white/90 dark:bg-[#1d1d20]/90 backdrop-blur-md shadow-lg p-2.5 transition-all select-none ${
        item.exiting ? '' : 'fade-in'
      }`}
      style={{
        animation: item.exiting
          ? 'fadeOutSlide 200ms ease-out forwards'
          : 'fadeInSlide 200ms ease-out forwards',
      }}
    >
      {/* Background progress track */}
      <div
        className={`absolute inset-0 pointer-events-none origin-left transition-transform ${config.barBg}`}
        style={{
          animation: `shrinkWidth ${duration}ms linear forwards`,
          animationPlayState: isPaused ? "paused" : "running",
        }}
      />

      <div className="relative flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0 pr-1">
          <div className="text-[13px] font-medium text-[var(--ods-text-primary,#18181b)] dark:text-neutral-100 leading-snug">
            {item.message}
          </div>
          {item.detailedMessage && (
            <div className="text-[12px] text-[var(--ods-text-secondary,#71717a)] dark:text-neutral-400 mt-0.5 truncate">
              {item.detailedMessage}
            </div>
          )}
        </div>
        <button
          onClick={() => onClose(item.id)}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-0.5 rounded hover:bg-black/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const addToast = useCallback(
    (message: string, options?: Omit<ToastItem, "id" | "message">) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev.slice(-3), { id, message, ...options }]);
    },
    []
  );

  const success = useCallback(
    (msg: string, detail?: string) =>
      addToast(msg, { detailedMessage: detail, variant: "success" }),
    [addToast]
  );
  const error = useCallback(
    (msg: string, detail?: string) =>
      addToast(msg, { detailedMessage: detail, variant: "error" }),
    [addToast]
  );
  const warning = useCallback(
    (msg: string, detail?: string) =>
      addToast(msg, { detailedMessage: detail, variant: "warning" }),
    [addToast]
  );
  const info = useCallback(
    (msg: string, detail?: string) =>
      addToast(msg, { detailedMessage: detail, variant: "info" }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, warning, info }}>
      {children}
      {/* Twenty fixed bottom-right container */}
      <div className="fixed bottom-3 right-3 z-50 flex flex-col gap-2 pointer-events-auto">
        {toasts.map((item) => (
          <SingleToast key={item.id} item={item} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context)
    throw new Error("useToast must be used within ToastProvider");
  return context;
};
