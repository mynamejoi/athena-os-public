"use client";

import { cn } from "@/lib/utils";

interface MobileMetricCardProps {
  label: string;
  value: string;
  color?: string;
  delta?: { value: string; positive: boolean };
  onClick?: () => void;
  className?: string;
}

export function MobileMetricCard({
  label,
  value,
  color,
  delta,
  onClick,
  className,
}: MobileMetricCardProps) {
  const content = (
    <>
      <span className={cn("text-sm font-serif font-bold", color || "text-[var(--athena-gold)]")}>
        {value}
      </span>
      <span className="text-[11px] text-white/50">{label}</span>
      {delta && (
        <span
          className={cn(
            "text-[10px] font-bold",
            delta.positive ? "text-emerald-400" : "text-red-400"
          )}
        >
          {delta.value}
        </span>
      )}
    </>
  );

  const sharedClasses = cn(
    "flex-shrink-0 flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5",
    onClick && "active:bg-white/5 min-h-[44px] cursor-pointer",
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={sharedClasses}>
        {content}
      </button>
    );
  }

  return <div className={sharedClasses}>{content}</div>;
}
