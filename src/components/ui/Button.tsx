"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "rec" | "ghost" | "outline" | "danger" | "onDark";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-white font-medium hover:brightness-110 active:translate-y-px border border-transparent",
  rec: "bg-rec text-white font-medium hover:brightness-110 active:translate-y-px border border-transparent",
  ghost:
    "bg-transparent text-ink-dim hover:text-ink hover:bg-panel-2 border border-transparent",
  outline:
    "bg-transparent text-ink border border-edge hover:border-ink-faint hover:bg-panel-2 active:translate-y-px",
  danger:
    "bg-transparent text-rec border border-transparent hover:bg-rec-soft",
  // For controls that float directly on the black recording backdrop
  // (e.g. the countdown), outside any white panel.
  onDark:
    "bg-white/10 text-white font-medium border border-white/25 hover:bg-white/20 active:translate-y-px backdrop-blur-sm",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-[15px] rounded-lg gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center whitespace-nowrap transition-colors duration-[130ms] disabled:opacity-40 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
