"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileListItemProps {
  title: string;
  subtitle?: string;
  leftColor?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function MobileListItem({
  title,
  subtitle,
  leftColor,
  icon,
  right,
  expandable,
  expanded,
  onClick,
  children,
  className,
}: MobileListItemProps) {
  return (
    <div
      className={cn(
        "border-b border-white/[0.04] last:border-0",
        leftColor && "border-l-2",
        className
      )}
      style={leftColor ? { borderLeftColor: leftColor } : undefined}
    >
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] w-full text-left"
      >
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white/90 truncate">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-white/40">{subtitle}</div>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
        {expandable && (
          <ChevronDown
            className={cn(
              "w-4 h-4 text-white/30 shrink-0 transition-transform",
              expanded && "rotate-180"
            )}
          />
        )}
      </motion.button>

      <AnimatePresence initial={false}>
        {expandable && expanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
