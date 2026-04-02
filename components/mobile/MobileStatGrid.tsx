"use client";

import { cn } from "@/lib/utils";

interface MobileStatGridProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileStatGrid({ children, className }: MobileStatGridProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto -mx-4 px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        className
      )}
    >
      <div className="flex gap-2 min-w-max">{children}</div>
    </div>
  );
}
