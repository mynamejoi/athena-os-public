'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { WhoopConnectionStatus } from './WhoopConnectionStatus';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { Sparkles } from 'lucide-react';

interface AthenaNavBarProps {
    activeTab: 'today' | 'week' | 'month' | 'year' | 'memories';
}

export function AthenaNavBar({ activeTab }: AthenaNavBarProps) {
    const router = useRouter();
    const { whoopEnabled } = useWhoopMode();
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const tabs = [
        { id: 'today', label: 'Today', path: '/productivity?tab=today-v2&view=health-v2' },
        { id: 'week', label: 'Week', path: '/productivity?tab=week-v2' },
        { id: 'month', label: 'Month', path: '/productivity?tab=analytics&view=month-v2' },
        { id: 'year', label: 'Year', path: '/productivity?tab=year-v2' },
        { id: 'memories', label: 'Memories', path: '/productivity?tab=memories-v2' }
    ];

    return (
        <nav className="sticky top-0 z-50 border-b border-athena-border bg-athena-bg/80 backdrop-blur-md pt-[env(safe-area-inset-top)]">
            <div className="max-w-7xl mx-auto px-3 md:px-6 h-auto md:h-16 py-2 md:py-0 flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-0">
                <button
                    onClick={() => router.push('/')}
                    className="text-athena-gold font-serif font-bold text-base md:text-xl tracking-[0.2em] hover:text-athena-gold-bright transition-colors cursor-pointer"
                >
                    ATHENA
                </button>

                <div className="flex flex-wrap items-center gap-0.5 md:gap-1 order-3 md:order-none w-full md:w-auto justify-center">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => router.push(tab.path)}
                            className={cn(
                                "px-3 md:px-6 py-2 md:py-2 text-xs md:text-sm font-medium transition-all relative font-sans min-h-[44px] flex items-center",
                                activeTab === tab.id ? "text-athena-gold" : "text-athena-text-muted hover:text-athena-text-primary"
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-athena-gold shadow-[0_0_8px_rgb(var(--athena-gold))]" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={() => router.push('/development-v2')}
                        className="px-3 py-1.5 text-xs font-medium font-sans rounded-full border border-athena-border text-athena-text-muted hover:text-athena-gold hover:border-athena-gold/50 transition-all min-h-[36px] inline-flex items-center gap-1.5"
                    >
                        <Sparkles size={14} className="md:hidden" />
                        <span className="hidden md:inline">Development</span>
                    </button>
                    <WhoopConnectionStatus />
                    <span className="text-[10px] md:text-xs text-athena-text-muted font-medium font-sans" suppressHydrationWarning>
                        {format(now, 'h:mm:ss a')}
                    </span>
                </div>
            </div>
        </nav>
    );
}
