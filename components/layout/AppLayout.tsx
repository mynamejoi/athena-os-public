'use client';

import { ReactNode, useEffect, useRef, useCallback } from 'react';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';

interface AppLayoutProps {
  children: ReactNode;
}

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 min background interval
const FOCUS_COOLDOWN = 5 * 60 * 1000; // 5 min minimum between focus-triggered syncs

function AppLayoutInner({ children }: AppLayoutProps) {
  const { whoopEnabled, loading: whoopLoading } = useWhoopMode();
  const lastSyncRef = useRef<number>(0);

  const syncWhoop = useCallback(async () => {
    const now = Date.now();
    // Skip if synced within the last 5 minutes
    if (now - lastSyncRef.current < FOCUS_COOLDOWN) return;
    lastSyncRef.current = now;
    try {
      await fetch('/api/whoop/sync', { method: 'POST' });
    } catch (e) {
      // Ignore errors (e.g. not connected)
    }
  }, []);

  // Background interval sync (every 15 min) + initial sync on mount
  useEffect(() => {
    if (whoopLoading || !whoopEnabled) return; // Wait for check to complete
    syncWhoop();
    const interval = setInterval(syncWhoop, SYNC_INTERVAL);
    return () => clearInterval(interval);
  }, [syncWhoop, whoopEnabled, whoopLoading]);

  // Sync when user returns to the app (tab focus / window visibility)
  useEffect(() => {
    if (whoopLoading || !whoopEnabled) return; // Wait for check to complete
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncWhoop();
      }
    };
    const handleFocus = () => syncWhoop();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncWhoop, whoopEnabled, whoopLoading]);

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-athena-bg">
      {/* Global Ambient Glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] rounded-full blur-[200px]" style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.06) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[500px] rounded-full blur-[180px]" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 70%)' }} />
      </div>

      {/* Main Content Area */}
      <main className="relative z-[1] flex-1 overflow-y-auto h-screen">
        {children}
      </main>
    </div>
  );
}

export default AppLayoutInner;
