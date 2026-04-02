"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  onSubtitleClick?: () => void;
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  onPrev,
  onNext,
  onSubtitleClick,
  className,
}: MobilePageHeaderProps) {
  return (
    <div className={cn("md:hidden flex items-center justify-between", className)}>
      <button
        type="button"
        onClick={onPrev}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/5"
      >
        <ChevronLeft className="w-5 h-5 text-[var(--athena-gold)]" />
      </button>

      <div className="flex flex-col items-center">
        <span className="text-lg font-serif bg-gradient-to-r from-[rgb(var(--athena-gold))] to-[rgb(var(--athena-gold-pale))] bg-clip-text text-transparent">
          {title}
        </span>
        {subtitle && (
          <button
            type="button"
            onClick={onSubtitleClick}
            className="text-[10px] text-[var(--athena-gold)]/60 active:text-[var(--athena-gold)]"
          >
            {subtitle}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-white/[0.06] active:bg-white/5"
      >
        <ChevronRight className="w-5 h-5 text-[var(--athena-gold)]" />
      </button>
    </div>
  );
}
