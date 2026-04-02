
"use client";

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { getISOWeek, getISOWeekYear } from 'date-fns';

export function DashboardHeader() {
    const [greeting, setGreeting] = useState('');
    const [dateStr, setDateStr] = useState('');
    const [weekStr, setWeekStr] = useState('');

    const [tick, setTick] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const now = new Date();
        const hour = now.getHours();

        // Greeting
        if (hour < 12) setGreeting('Good Morning');
        else if (hour < 18) setGreeting('Good Afternoon');
        else setGreeting('Good Evening');

        // Date: "Saturday, October 28"
        setDateStr(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));

        // Week Number (ISO)
        const week = getISOWeek(now);
        const year = getISOWeekYear(now);
        setWeekStr(`Week ${week}, ${year}`);

    }, [tick]);

    return (
        <div className="mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-foreground/90 font-serif">
                        {greeting}, there
                    </h1>
                    <p className="text-muted-foreground mt-1 text-lg">
                        {dateStr} <span className="mx-2">•</span> {weekStr}
                    </p>
                </div>

                {/* Time & Week Display */}
                <div className="flex gap-4">
                    <Card className="p-3 flex items-center gap-3 bg-secondary/50 border-none min-w-[140px]">
                        <div className="p-2 bg-athena-gold/10 rounded-full text-athena-gold">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-semibold">Time</p>
                            <p className="font-bold font-mono text-lg leading-none">
                                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                        </div>
                    </Card>

                    <Card className="p-3 flex items-center gap-3 bg-secondary/50 border-none">
                        <div className="p-2 bg-athena-gold/10 rounded-full text-athena-gold">
                            <span className="font-bold text-sm px-1">W</span>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground uppercase font-semibold">Current Week</p>
                            <p className="font-bold">{weekStr.split(',')[0]}</p>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
