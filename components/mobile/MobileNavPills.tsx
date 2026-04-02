"use client";

import { cn } from "@/lib/utils";

interface NavPillItem {
  key: string;
  label: string;
  color?: string;
}

interface MobileNavPillsProps {
  items: NavPillItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  variant?: "rounded" | "pill";
  scrollable?: boolean;
  className?: string;
}

export type { NavPillItem };

export function MobileNavPills({
  items,
  activeKey,
  onSelect,
  variant = "pill",
  scrollable = false,
  className,
}: MobileNavPillsProps) {
  const radiusClass = variant === "rounded" ? "rounded-lg" : "rounded-full";

  const pills = (
    <div className={cn("flex gap-1.5", className)}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const hasColor = isActive && item.color;

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              "shrink-0 px-3 py-2 text-xs font-semibold min-h-[44px] transition-colors border",
              radiusClass,
              !isActive && "text-white/50 border-transparent",
              isActive && !hasColor && "bg-[var(--athena-gold)]/20 text-[var(--athena-gold)] font-bold border-[var(--athena-gold)]/30"
            )}
            style={
              hasColor
                ? {
                    color: item.color,
                    borderColor: item.color + "40",
                    background: item.color + "18",
                  }
                : undefined
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  if (scrollable) {
    return (
      <div className="overflow-x-auto -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {pills}
      </div>
    );
  }

  return pills;
}
