'use client';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

import { SINGLE_USER_ID } from '@/lib/constants';

interface WhoopModeContextType {
  whoopEnabled: boolean;
  loading: boolean;
  devToggle: () => void; // Dev-only: toggle WHOOP mode for preview
  isOverridden: boolean; // True when dev toggle is active
  previewGenerating: boolean;
  previewStatus: string | null;
}

const WhoopModeContext = createContext<WhoopModeContextType>({
  whoopEnabled: false,
  loading: true,
  devToggle: () => {},
  isOverridden: false,
  previewGenerating: false,
  previewStatus: null,
});

export function useWhoopMode() {
  return useContext(WhoopModeContext);
}

export function WhoopModeProvider({ children }: { children: React.ReactNode }) {
  const [actualEnabled, setActualEnabled] = useState(false);
  const [overrideOff, setOverrideOff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const prevWhoopEnabled = useRef<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/whoop/status');
        if (res.ok) {
          const data = await res.json();
          setActualEnabled(data.connected === true);
        } else {
          setActualEnabled(false);
        }
      } catch {
        setActualEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    check();
  }, []);

  const whoopEnabled = overrideOff ? false : actualEnabled;

  // Clean up preview data when WHOOP is toggled back on
  useEffect(() => {
    if (prevWhoopEnabled.current === false && whoopEnabled === true) {
      // Toggled from off -> on, clean up preview data
      const cleanup = async () => {
        try {
          const { createClient } = await import('@/utils/supabase/client');
          const supabase = createClient();

          const { count: reportCount } = await supabase
            .from('ai_reports')
            .select('*', { count: 'exact', head: true })
            .eq('is_preview', true)
            .eq('user_id', SINGLE_USER_ID);

          if (reportCount && reportCount > 0) {
            await supabase.from('ai_reports').delete().eq('is_preview', true).eq('user_id', SINGLE_USER_ID);
          }

          const { count: coachCount } = await supabase
            .from('coach_notes')
            .select('*', { count: 'exact', head: true })
            .eq('is_preview', true);

          if (coachCount && coachCount > 0) {
            await supabase.from('coach_notes').delete().eq('is_preview', true);
          }
        } catch (err) {
          console.error('[WhoopMode] Preview cleanup failed:', err);
        }
      };
      cleanup();
    }
    prevWhoopEnabled.current = whoopEnabled;
  }, [whoopEnabled]);

  const devToggle = () => {
    const togglingOff = !overrideOff; // will become true = WHOOP off
    setOverrideOff(prev => !prev);
    if (togglingOff) {
      generatePreview();
    }
  };

  const generatePreview = async () => {
    setPreviewGenerating(true);
    setPreviewStatus(null);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      });
      const data = await res.json();
      if (data.success) {
        const generated = (data.results || []).filter((r: any) => !r.skipped && r.success).length;
        setPreviewStatus(`Preview generated (${generated} reports)`);
      } else {
        setPreviewStatus('Preview partially failed');
      }
    } catch (err) {
      console.error('[WhoopMode] Preview generation failed:', err);
      setPreviewStatus('Preview generation failed');
    } finally {
      setPreviewGenerating(false);
      // Clear status after 5 seconds
      setTimeout(() => setPreviewStatus(null), 5000);
    }
  };

  return (
    <WhoopModeContext.Provider value={{
      whoopEnabled, loading, devToggle, isOverridden: overrideOff,
      previewGenerating, previewStatus,
    }}>
      {children}
    </WhoopModeContext.Provider>
  );
}
