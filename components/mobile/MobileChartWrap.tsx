"use client";

import { cn } from "@/lib/utils";

interface MobileChartWrapProps {
  height?: number;
  desktopHeight?: number | "auto";
  children: React.ReactNode;
  className?: string;
}

export function MobileChartWrap({
  height = 200,
  desktopHeight = "auto",
  children,
  className,
}: MobileChartWrapProps) {
  return (
    <div
      className={cn("w-full", className)}
      style={{ height: `${height}px` }}
    >
      <div
        className="w-full h-full"
        style={desktopHeight !== "auto" ? { ["--desktop-h" as string]: `${desktopHeight}px` } : undefined}
      >
        <style>{`@media (min-width: 768px) { [style*="--desktop-h"] { height: var(--desktop-h) !important; } }`}</style>
        {children}
      </div>
    </div>
  );
}
