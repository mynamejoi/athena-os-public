"use client";

import { cn } from "@/lib/utils";

interface MobileSectionProps {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function MobileSection({
  icon,
  title,
  count,
  action,
  children,
  className,
}: MobileSectionProps) {
  return (
    <div className={cn(className)}>
      <div className="flex items-center gap-2 mb-2 text-white/50">
        {icon}
        <span className="text-xs uppercase tracking-wider font-bold">
          {title}
          {count != null && (
            <span className="text-white/40"> ({count})</span>
          )}
        </span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}
