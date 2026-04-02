'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Heart } from 'lucide-react';
import { WhoopConnectionStatus } from './WhoopConnectionStatus';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';

interface DevelopmentNavBarProps {
    activeTab: 'calendar' | 'projects' | 'workouts' | 'analytics' | 'library';
}

export function DevelopmentNavBar({ activeTab }: DevelopmentNavBarProps) {
    const router = useRouter();
    useWhoopMode(); // Keep provider active
    const [now, setNow] = React.useState(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const tabs = [
        { id: 'projects', label: 'Projects', path: '/development-v2?tab=projects' },
        { id: 'workouts', label: 'Workouts', path: '/development-v2?tab=workouts' },
        { id: 'calendar', label: 'Calendar', path: '/development-v2?tab=calendar' },
        { id: 'analytics', label: 'Analytics', path: '/development-v2?tab=analytics' },
        { id: 'library', label: 'Library', path: '/development-v2?tab=library' }
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

                <div className="flex items-center gap-0.5 md:gap-1 order-3 md:order-none w-full md:w-auto justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-nowrap md:flex-wrap">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => router.push(tab.path)}
                            className={cn(
                                "px-3 md:px-6 py-2 md:py-2 text-xs md:text-sm font-medium transition-all relative font-sans min-h-[44px] flex items-center shrink-0",
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
                        onClick={() => router.push('/productivity?tab=today-v2&view=health-v2')}
                        className="px-3 py-1.5 text-xs font-medium font-sans rounded-full border border-athena-border text-athena-text-muted hover:text-athena-gold hover:border-athena-gold/50 transition-all min-h-[36px] inline-flex items-center gap-1.5"
                    >
                        <Heart size={14} className="md:hidden" />
                        <span className="hidden md:inline">Health</span>
                    </button>
                    <WhoopConnectionStatus />
                    <span className="text-[10px] md:text-xs text-athena-text-muted font-medium font-sans" suppressHydrationWarning>
                        {format(now, 'h:mm a')}
                    </span>
                </div>
            </div>
        </nav>
    );
}
