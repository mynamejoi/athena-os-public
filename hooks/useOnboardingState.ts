'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

const STORAGE_KEY = 'athena_onboarding';

interface OnboardingState {
  currentStep: number;
  completed: boolean;
  skippedSteps: number[];
  createdIds: {
    habits: string[];
    projects: string[];
    tasks: string[];
    books: string[];
    goals: string[];
  };
  testMode: boolean;
  whoopConnected: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  currentStep: 0,
  completed: false,
  skippedSteps: [],
  createdIds: {
    habits: [],
    projects: [],
    tasks: [],
    books: [],
    goals: [],
  },
  testMode: false,
  whoopConnected: false,
};

function loadState(): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function checkIsNewUser(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const [{ count: habitsCount }, { count: projectsCount }] = await Promise.all([
    supabase.from('today_habits').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
  ]);
  return (habitsCount ?? 0) === 0 && (projectsCount ?? 0) === 0;
}

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [isNewUser, setIsNewUser] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const loaded = loadState();
    setState(loaded);

    // Only check if not already completed
    if (!loaded.completed && !loaded.testMode) {
      const supabase = createClient();
      checkIsNewUser(supabase).then(setIsNewUser).catch(() => setIsNewUser(false));
    }
  }, []);

  const update = useCallback((updater: (prev: OnboardingState) => OnboardingState) => {
    setState((prev) => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  const nextStep = useCallback(() => {
    update((s) => ({ ...s, currentStep: s.currentStep + 1 }));
  }, [update]);

  const prevStep = useCallback(() => {
    update((s) => ({ ...s, currentStep: Math.max(0, s.currentStep - 1) }));
  }, [update]);

  const skipStep = useCallback(() => {
    update((s) => ({
      ...s,
      skippedSteps: [...s.skippedSteps, s.currentStep],
      currentStep: s.currentStep + 1,
    }));
  }, [update]);

  const completeOnboarding = useCallback(() => {
    update((s) => ({ ...s, completed: true, testMode: false }));
  }, [update]);

  const trackCreatedId = useCallback((type: keyof OnboardingState['createdIds'], id: string) => {
    update((s) => ({
      ...s,
      createdIds: {
        ...s.createdIds,
        [type]: [...s.createdIds[type], id],
      },
    }));
  }, [update]);

  const setWhoopConnected = useCallback((connected: boolean) => {
    update((s) => ({ ...s, whoopConnected: connected }));
  }, [update]);

  const resetOnboarding = useCallback(async () => {
    const supabase = createClient();
    const ids = state.createdIds;

    // Delete created tasks by source_habit_id
    if (ids.habits.length > 0) {
      await supabase.from('daily_tasks').delete().in('source_habit_id', ids.habits);
      await supabase.from('today_habits').delete().in('id', ids.habits);
    }
    if (ids.tasks.length > 0) {
      await supabase.from('daily_tasks').delete().in('id', ids.tasks);
    }

    // Delete books
    if (ids.books.length > 0) {
      await supabase.from('books').delete().in('id', ids.books);
    }

    // Delete monthly goals
    if (ids.goals.length > 0) {
      await supabase.from('monthly_goals').delete().in('id', ids.goals);
    }

    // Delete projects and cascade to sections/tasks
    if (ids.projects.length > 0) {
      await supabase.from('tasks').delete().in('project_id', ids.projects);
      await supabase.from('sections').delete().in('project_id', ids.projects);
      await supabase.from('projects').delete().in('id', ids.projects);
    }

    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
    setIsNewUser(null);
  }, [state.createdIds]);

  const enterTestMode = useCallback(() => {
    const fresh: OnboardingState = { ...DEFAULT_STATE, testMode: true };
    saveState(fresh);
    setState(fresh);
  }, []);

  const shouldShowOnboarding = mounted && !state.completed && (state.testMode || isNewUser === true);

  return {
    state,
    nextStep,
    prevStep,
    skipStep,
    completeOnboarding,
    trackCreatedId,
    resetOnboarding,
    shouldShowOnboarding,
    enterTestMode,
    setWhoopConnected,
  };
}
