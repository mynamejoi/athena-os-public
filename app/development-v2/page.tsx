"use client";

import { Suspense } from 'react';

import { useSearchParams } from 'next/navigation';
import { DevelopmentNavBar } from '@/components/productivity/DevelopmentNavBar';
import { CalendarView } from '@/components/productivity/CalendarView';
import { DevelopmentProjectsWorkspace } from '@/components/productivity/DevelopmentProjectsWorkspace';
import { DevelopmentLibraryWorkspace } from '@/components/productivity/DevelopmentLibraryWorkspace';
import { DevelopmentWorkoutsWorkspace } from '@/components/productivity/DevelopmentWorkoutsWorkspace';
import AnalyticsViewV2 from '@/components/productivity/AnalyticsViewV2';
import { motion } from 'framer-motion';

// We wrap the searchParams usage in a Suspense boundary per Next.js best practices
function DevelopmentV2Content() {
    const searchParams = useSearchParams();
    const tab = (searchParams.get('tab') as 'calendar' | 'projects' | 'workouts' | 'analytics' | 'library') || 'projects';

    const tabLabels = {
        calendar: 'Calendar',
        projects: 'Projects',
        workouts: 'Workouts',
        analytics: 'Analytics',
        library: 'Library'
    };

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary font-manrope selection:bg-athena-gold-dim/30">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[120px]" />
            </div>

            <DevelopmentNavBar activeTab={tab} />

            <main className="relative z-10 max-w-7xl mx-auto px-2 md:px-8 lg:px-16 py-0 md:py-8 pb-20 md:pb-8 space-y-0 md:space-y-4 font-sans overflow-x-hidden">
                {/* Header */}
                {tab !== 'projects' && tab !== 'analytics' && (
                    <motion.header
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="hidden md:flex items-end justify-between"
                    >
                        <div className="w-full">
                            <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold font-sans">
                                {tabLabels[tab]}
                            </div>
                        </div>
                    </motion.header>
                )}

                {tab === 'calendar' && <CalendarView />}
                {tab === 'projects' && <DevelopmentProjectsWorkspace />}
                {tab === 'workouts' && <DevelopmentWorkoutsWorkspace />}
                {tab === 'analytics' && <AnalyticsViewV2 />}
                {tab === 'library' && <DevelopmentLibraryWorkspace />}
            </main>
        </div>
    );
}

export default function DevelopmentV2Page() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
            <DevelopmentV2Content />
        </Suspense>
    );
}
