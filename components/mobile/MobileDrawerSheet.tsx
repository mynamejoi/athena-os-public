"use client";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface MobileDrawerSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;
  fullScreen?: boolean;
  className?: string;
}

export function MobileDrawerSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
  fullScreen = false,
  className,
}: MobileDrawerSheetProps) {
  const heightStyle = fullScreen ? "92vh" : maxHeight;

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent
        className={cn(
          "bg-[#0e0c0a] border-white/[0.06]",
          className
        )}
        style={{ maxHeight: heightStyle }}
      >
        {title && (
          <DrawerHeader className="pb-2 pt-2">
            <DrawerTitle className="text-lg font-semibold text-white/90 text-left">
              {title}
            </DrawerTitle>
          </DrawerHeader>
        )}
        <div className="overflow-y-auto flex-1 min-h-0 p-4 pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
