import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { IconComponent } from "@/components/ui/icons";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./variants";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** FA6 icon from @/components/ui/icons, shown before the label. */
  icon?: IconComponent;
  /** Full width of its container. */
  block?: boolean;
  /** Shows "label…" and disables the button while true. */
  busy?: boolean;
  busyLabel?: string;
  children?: ReactNode;
}

/**
 * The app's button. Five variants, three sizes, one radius and type size;
 * an icon-only button is a Button with `icon` and an aria-label.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, block, busy, busyLabel, children, className = "", disabled, type = "button", ...rest },
  ref,
) {
  const iconOnly = !!Icon && (children === undefined || children === null || children === false);
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${buttonClass({ variant, size, iconOnly, block })} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5"} aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
});
