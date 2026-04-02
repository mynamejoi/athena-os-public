import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { toETDateString } from '@/lib/date-utils';

type Schedule = { type: 'frequency'; days: number[] | null } | { type: 'dates'; dates: Set<string> };

function isScheduledDay(schedule: Schedule, date: Date): boolean {
    if (schedule.type === 'dates') {
        return schedule.dates.has(formatDate(date));
    }
    if (!schedule.days) return true; // null = every day
    return schedule.days.includes(date.getDay());
}

export async function GET() {
    try {
        // Fetch habits with their frequencies
        const { data: habitsData } = await supabase
            .from('today_habits')
            .select('title, frequency');

        const habitSchedule: Record<string, Schedule> = {};
        for (const h of habitsData || []) {
            habitSchedule[h.title] = { type: 'frequency', days: h.frequency };
        }

        // Timezone-aware today
        const now = new Date();
        const todayStr = toETDateString(now);
        const today = new Date(todayStr + 'T12:00:00');
        const currentYear = todayStr.slice(0, 4);

        // Fetch completed daily_tasks for current year
        const { data, error } = await supabase
            .from('daily_tasks')
            .select('title, date')
            .eq('status', 'Completed')
            .eq('is_one_off', false)
            .gte('date', `${currentYear}-01-01`)
            .order('date', { ascending: false })
            .limit(5000);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Group completed dates by habit title
        const habitDates: Record<string, Set<string>> = {};
        for (const row of data || []) {
            if (!habitDates[row.title]) {
                habitDates[row.title] = new Set();
            }
            habitDates[row.title].add(row.date);
        }

        // For tasks without a matching habit (workout-plan-generated like "Push (Chest)"),
        // build a schedule from the dates they actually appear in daily_tasks
        for (const title of Object.keys(habitDates)) {
            if (!(title in habitSchedule)) {
                const { data: allOccurrences } = await supabase
                    .from('daily_tasks')
                    .select('date')
                    .eq('title', title)
                    .not('is_one_off', 'is', true)
                    .order('date', { ascending: false })
                    .limit(90);

                if (allOccurrences && allOccurrences.length > 0) {
                    habitSchedule[title] = {
                        type: 'dates',
                        dates: new Set(allOccurrences.map(o => o.date)),
                    };
                }
            }
        }

        const streaks: Record<string, { current: number; previousStreak: number; bestThisYear: number; bestStreakStart: string | null; bestStreakEnd: string | null }> = {};

        for (const [title, dates] of Object.entries(habitDates)) {
            const schedule = habitSchedule[title] ?? { type: 'frequency', days: null };

            let currentStreak = 0;
            let previousStreak = 0;
            const checkDate = new Date(today);

            if (isScheduledDay(schedule, checkDate) && !dates.has(todayStr)) {
                checkDate.setDate(checkDate.getDate() - 1);
            } else if (!isScheduledDay(schedule, checkDate)) {
                checkDate.setDate(checkDate.getDate() - 1);
            }

            // Count current streak
            for (let i = 0; i < 365; i++) {
                const dateStr = formatDate(checkDate);
                if (!isScheduledDay(schedule, checkDate)) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                if (dates.has(dateStr)) {
                    currentStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            // Skip past the gap to find previous streak
            for (let i = 0; i < 365; i++) {
                const dateStr = formatDate(checkDate);
                if (!isScheduledDay(schedule, checkDate)) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                if (!dates.has(dateStr)) {
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            // Count previous streak
            for (let i = 0; i < 365; i++) {
                const dateStr = formatDate(checkDate);
                if (!isScheduledDay(schedule, checkDate)) {
                    checkDate.setDate(checkDate.getDate() - 1);
                    continue;
                }
                if (dates.has(dateStr)) {
                    previousStreak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }

            // Find best streak this year by walking through all sorted completed dates
            const sortedDates = Array.from(dates).sort();
            let bestLength = 0;
            let bestStart: string | null = null;
            let bestEnd: string | null = null;
            let runLength = 1;
            let runStart = sortedDates[0] || null;

            for (let i = 1; i < sortedDates.length; i++) {
                // Check if there's a missed scheduled day between consecutive completions
                const from = new Date(sortedDates[i - 1] + 'T12:00:00');
                const to = new Date(sortedDates[i] + 'T12:00:00');
                let hasMiss = false;
                const check = new Date(from);
                check.setDate(check.getDate() + 1);
                while (check < to) {
                    if (isScheduledDay(schedule, check)) {
                        const checkStr = formatDate(check);
                        if (!dates.has(checkStr)) {
                            hasMiss = true;
                            break;
                        }
                    }
                    check.setDate(check.getDate() + 1);
                }

                if (!hasMiss) {
                    runLength++;
                } else {
                    if (runLength > bestLength) {
                        bestLength = runLength;
                        bestStart = runStart;
                        bestEnd = sortedDates[i - 1];
                    }
                    runLength = 1;
                    runStart = sortedDates[i];
                }
            }
            // Final run
            if (runLength > bestLength) {
                bestLength = runLength;
                bestStart = runStart;
                bestEnd = sortedDates[sortedDates.length - 1] || null;
            }
            if (sortedDates.length === 0) {
                bestLength = 0;
            }

            streaks[title] = { current: currentStreak, previousStreak, bestThisYear: bestLength, bestStreakStart: bestStart, bestStreakEnd: bestEnd };
        }

        return NextResponse.json({ streaks });
    } catch (err: any) {
        console.error('Streaks error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
