'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { TourModal } from './TourModal';
import { SetupModal } from './SetupModal';

export function OnboardingWalkthrough() {
  const pathname = usePathname();
  const { shouldShowOnboarding, completeOnboarding, trackCreatedId } = useOnboardingState();
  const [phase, setPhase] = useState<'tour' | 'setup'>('tour');

  if (pathname === '/login') return null;
  if (!shouldShowOnboarding) return null;

  if (phase === 'tour') {
    return (
      <TourModal
        onComplete={(startSetup) => {
          if (startSetup) {
            setPhase('setup');
          } else {
            completeOnboarding();
          }
        }}
      />
    );
  }

  return (
    <SetupModal
      onComplete={completeOnboarding}
      trackCreatedId={trackCreatedId}
    />
  );
}
