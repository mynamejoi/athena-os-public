"use client";

import { useState, useEffect } from 'react';
import { DashboardHeader } from '@/components/productivity/DashboardHeader';
import { HabitTrackerWidgetV2 } from '@/components/productivity/HabitTrackerWidgetV2';
import MonthViewV2 from '@/components/productivity/MonthViewV2';
import WeekViewV2 from '@/components/productivity/WeekViewV2';

import { MemoriesView } from '@/components/productivity/MemoriesView';
import { DevelopmentLibraryWorkspace } from '@/components/productivity/DevelopmentLibraryWorkspace';
import { cn } from '@/lib/utils';
import { CalendarView } from '@/components/productivity/CalendarView';
import YearViewV2 from '@/components/productivity/YearViewV2';
import AnalyticsViewV2 from '@/components/productivity/AnalyticsViewV2';
import MemoriesViewV2 from '@/components/productivity/MemoriesViewV2';
import { ProjectsViewV2 } from '@/components/productivity/ProjectsViewV2';
import { DevelopmentWorkoutsWorkspace } from '@/components/productivity/DevelopmentWorkoutsWorkspace';
import { LayoutGrid, BarChart3, BookOpen, Sparkles, TrendingUp, Calendar, Rocket, Dumbbell } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function ProductivityPage() {
    const searchParams = useSearchParams();
    const view = searchParams.get('view');
    const [activeTab, setActiveTab] = useState<string>(() => {
        const tab = searchParams.get('tab');
        if (tab) return tab;
        return 'calendar';
    });

    // Sync activeTab with URL search params when they change
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    // If Today 2.0 is active, render it full screen without legacy wrappers
    if (activeTab === 'today-v2') {
        return <HabitTrackerWidgetV2 />;
    }

    // If Week 2.0 is active, render it full screen
    if (activeTab === 'week-v2') {
        return <WeekViewV2 />;
    }

    // If Month 2.0 is active, render it full screen
    if (activeTab === 'analytics' && view === 'month-v2') {
        return <MonthViewV2 />;
    }

    // If Year 2.0 is active, render it full screen
    if (activeTab === 'year-v2') {
        return <YearViewV2 />;
    }

// If Memories 2.0 is active, render it full screen
    if (activeTab === 'memories-v2') {
        return <MemoriesViewV2 />;
    }

    return (
        <div className="min-h-screen bg-athena-bg relative p-3 md:p-10 pb-32">
            {/* Animated background gradient - matching home page */}
            <div className="absolute inset-0 bg-gradient-to-br from-athena-gold/5 via-transparent to-purple-500/5 animate-pulse" />

            <div className="max-w-7xl mx-auto space-y-8 relative z-10">

                {/* Header Section */}
                <DashboardHeader />

                {/* Tabs & Main Content */}
                <div className="space-y-6">
                    {/* Tab Switcher */}
                    <div className="flex justify-center">
                        <div className="flex flex-wrap items-center justify-center gap-1 p-1 bg-white/5 rounded-2xl md:rounded-full border border-athena-gold/20 backdrop-blur-md">
                            {(!view || view === 'health') && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('today')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'today'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                        Today
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('analytics')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'analytics'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <BarChart3 className="w-4 h-4" />
                                        Month
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('year')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'year'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <TrendingUp className="w-4 h-4" />
                                        Year
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('memories-v2')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'memories-v2'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Memories
                                    </button>
                                </>
                            )}

                            {!view && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('calendar')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'calendar'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <Calendar className="w-4 h-4" />
                                        Calendar
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('projects-v2')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'projects-v2'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <Rocket className="w-4 h-4" />
                                        Projects
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('workouts')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'workouts'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <Dumbbell className="w-4 h-4" />
                                        Workouts
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('analytics-v2')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'analytics-v2'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <BarChart3 className="w-4 h-4" />
                                        Analytics
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('library')}
                                        className={cn(
                                            "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300",
                                            activeTab === 'library'
                                                ? "bg-athena-gold/20 text-athena-gold shadow-lg shadow-athena-gold/10 scale-105"
                                                : "text-white/50 hover:text-athena-gold hover:bg-athena-gold/10"
                                        )}
                                    >
                                        <BookOpen className="w-4 h-4" />
                                        Library
                                    </button>
                                </>
                            )}

                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="w-full">
                        {activeTab === 'calendar' && <CalendarView />}
                        {activeTab === 'projects-v2' && <ProjectsViewV2 />}
                        {activeTab === 'workouts' && <DevelopmentWorkoutsWorkspace />}
                        {activeTab === 'analytics-v2' && <AnalyticsViewV2 />}
                        {activeTab === 'library' && <DevelopmentLibraryWorkspace />}
                        {activeTab === 'memories' && <MemoriesView />}
                    </div>
                </div>
            </div>
        </div>
    );
}
