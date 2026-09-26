import React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "blue" | "green" | "amber" | "red" | "gray" | "purple" | "emerald" | "indigo" | "rose";
type BadgeSize = "sm" | "md";

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  blue: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
  green: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  red: "bg-red-500/10 text-red-700 border border-red-500/20",
  gray: "bg-gray-500/10 text-gray-600 border border-gray-500/20",
  purple: "bg-purple-500/10 text-purple-700 border border-purple-500/20",
  emerald: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
  indigo: "bg-indigo-500/10 text-indigo-700 border border-indigo-500/20",
  rose: "bg-rose-500/10 text-rose-700 border border-rose-500/20",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "text-[11px] px-1.5 py-0.5",
  md: "text-[12px] px-2 py-0.5",
};

export function Badge({
  variant = "gray",
  size = "sm",
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] font-medium border",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {children}
    </span>
  );
}
