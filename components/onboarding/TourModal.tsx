'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ACCENT_PALETTES } from '@/lib/theme-colors';
import { useThemeColor } from '@/components/providers/ThemeColorProvider';

interface TourModalProps {
  onComplete: (startSetup: boolean) => void;
}

const TOUR_STEPS = [
  { path: null, title: 'Welcome to Athena', description: 'Your personal operating system for health and development. This quick tour will walk you through each page. You can set up your data after.' },
  { path: '/', title: 'Home', description: 'Your dashboard at a glance. Health stats on the left, development stats on the right. Everything updates automatically as you use the tool.' },
  { path: '/productivity?tab=today-v2&view=health-v2', title: 'Today', description: 'Your daily command center. Habits refresh each morning based on your schedule. Log a journal entry, set your win of the day, and check your morning briefing -- an AI-generated summary of your recovery, habits, and training plan.' },
  { path: '/productivity?tab=analytics&view=month-v2', title: 'Month', description: 'Monthly overview with a calendar heatmap colored by your daily scores. Track monthly goals with progress rings. Click any day to see its report.' },
  { path: '/productivity?tab=year-v2', title: 'Year', description: 'The long view. A full-year heatmap, yearly goals, and your longest habit streaks. This is where consistency becomes visible.' },
  { path: '/productivity?tab=memories-v2', title: 'Memories', description: 'Capture highlights and vacations with photos. Tag them by category -- Milestone, Social, Fitness, Travel -- and build a personal timeline.' },
  { path: '/development-v2?tab=calendar', title: 'Calendar', description: 'Visual task scheduling. See your project tasks laid out by date. Drag to reschedule on desktop. Recovery scores tint each day when WHOOP is connected.' },
  { path: '/development-v2?tab=projects', title: 'Projects', description: 'Organize work into projects with sections and tasks. Use the AI Planner to break down ideas into structured plans, or the Brain Dump to convert raw notes into actionable tasks.' },
  { path: '/development-v2?tab=workouts', title: 'Workouts', description: 'Your AI workout coach. Athena builds weekly splits based on recovery data and training history. Before each session, you get exercise prescriptions with specific sets, reps, and weights.' },
  { path: '/development-v2?tab=analytics', title: 'Analytics', description: 'Deep dives into your data. Recovery trends, sleep architecture, habit impact scores, training load analysis. Unlocks progressively as you accumulate data.' },
  { path: '/development-v2?tab=library', title: 'Library', description: 'Track your reading. Add books, log page progress, and organize into Active, Queue, and Finished zones.' },
  { path: null, title: 'WHOOP Integration', description: 'Optional but powerful. Connecting WHOOP adds recovery-aware coaching, sleep quality analysis, strain tracking, and biometric trends to everything Athena does. Without it, you still get habit tracking, AI planning, workout coaching from history, and all project and reading features.' },
  { path: null, title: 'Tour Complete', description: '' },
];

export function TourModal({ onComplete }: TourModalProps) {
  const router = useRouter();
  const { accentId, setAccentColor } = useThemeColor();
  const [step, setStep] = useState(0);
  const [navigating, setNavigating] = useState(false);

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const isDone = step === TOUR_STEPS.length - 1;

  // Navigate when step changes
  useEffect(() => {
    const s = TOUR_STEPS[step];
    if (!s.path) {
      setNavigating(false);
      return;
    }
    setNavigating(true);
    router.push(s.path);
    const timer = setTimeout(() => setNavigating(false), 300);
    return () => clearTimeout(timer);
  }, [step, router]);

  const handleNext = () => {
    if (isDone) return;
    setStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="bg-athena-bg border border-athena-border rounded-2xl p-6 max-w-lg w-[90vw] relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-athena-text-dim uppercase tracking-widest">
              Step {step + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={() => onComplete(false)}
              className="p-2 -mr-2 -mt-2 text-athena-text-dim hover:text-athena-text-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-serif text-athena-gold mb-3">
            {current.title}
          </h2>

          {/* Content */}
          {navigating ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Welcome step: accent picker */}
              {isFirst && (
                <>
                  <p className="text-athena-text-muted text-sm leading-relaxed mb-6">
                    {current.description}
                  </p>
                  <div className="mb-6">
                    <p className="text-xs text-athena-text-dim uppercase tracking-widest mb-3">
                      Choose your theme
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      {ACCENT_PALETTES.map((palette) => (
                        <button
                          key={palette.id}
                          onClick={() => setAccentColor(palette.id)}
                          className="p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
                          title={palette.label}
                        >
                          <div
                            className={`w-6 h-6 rounded-full transition-all duration-300 ${
                              palette.id === accentId
                                ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-athena-bg scale-110'
                                : 'opacity-40 hover:opacity-80 hover:scale-110'
                            }`}
                            style={{ background: palette.DEFAULT }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Done step */}
              {isDone && (
                <p className="text-athena-text-muted text-sm leading-relaxed mb-6">
                  You&apos;ve seen everything. Want to set up your habits, projects, and goals now?
                </p>
              )}

              {/* Regular tour steps */}
              {!isFirst && !isDone && (
                <p className="text-athena-text-muted text-sm leading-relaxed mb-6">
                  {current.description}
                </p>
              )}
            </>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-between gap-3">
            {!isFirst && !isDone ? (
              <button
                onClick={handleBack}
                className="px-4 py-3 text-sm text-athena-text-dim hover:text-athena-text-muted transition-colors min-h-[44px]"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {isFirst && (
              <button
                onClick={handleNext}
                className="ml-auto px-6 py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]"
              >
                Start Tour
              </button>
            )}

            {isDone && (
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => onComplete(false)}
                  className="px-4 py-3 text-sm text-athena-text-dim hover:text-athena-text-muted transition-colors min-h-[44px]"
                >
                  Skip -- I&apos;ll explore on my own
                </button>
                <button
                  onClick={() => onComplete(true)}
                  className="px-6 py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]"
                >
                  Start Setup
                </button>
              </div>
            )}

            {!isFirst && !isDone && (
              <button
                onClick={handleNext}
                disabled={navigating}
                className="px-6 py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]"
              >
                Next
              </button>
            )}
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? 'bg-athena-gold w-3'
                    : i < step
                      ? 'bg-athena-gold/40'
                      : 'bg-athena-text-dim/30'
                }`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
