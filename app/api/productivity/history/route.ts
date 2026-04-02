import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';


export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
        return NextResponse.json({ error: 'Start and End dates required' }, { status: 400 });
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // 1. Fetch Daily Summaries (Day %, Wins, Journal)
        const { data: summaries, error: summaryError } = await supabase
            .from('daily_summaries')
            .select('date, day_percentage, win_of_the_day, journal_entry, recovery_score, strain_score, sleep_score')
            .gte('date', start)
            .lte('date', end)
            .limit(366);

        if (summaryError) throw summaryError;

        // 2. Fetch Whoop Data (Vitals)
        // Ensure we get HRV, RHR, Calories for the new submetrics
        const { data: whoopData, error: whoopError } = await supabase
            .from('whoop_data')
            .select('*') // Select all to be safe, or specify needed fields: recovery_score, strain, sleep_performance, sleep_hours, hrv, resting_hr, calories_burned
            .gte('date', start)
            .lte('date', end)
            .limit(366);

        if (whoopError) console.error('Whoop fetch error:', whoopError);

        // 3. Fetch Daily Tasks (for Habit Counts)
        // We need to count completed non-one-off tasks per day
        const { data: tasks, error: taskError } = await supabase
            .from('daily_tasks')
            .select('date, status, is_one_off')
            .gte('date', start)
            .lte('date', end);

        if (taskError) throw taskError;

        // 4. Aggregate
        // Group tasks by date
        const tasksByDate: Record<string, { completed: number, total: number }> = {};
        (tasks || []).forEach((t: any) => {
            const d = t.date;
            if (!tasksByDate[d]) tasksByDate[d] = { completed: 0, total: 0 };

            tasksByDate[d].total++;
            if (t.status === 'Completed') tasksByDate[d].completed++;
        });

        // 5. Merge Data
        const allDates = new Set([
            ...(summaries || []).map(s => s.date),
            ...(whoopData || []).map(w => w.date),
            ...Object.keys(tasksByDate)
        ]);

        const history = Array.from(allDates).map(date => {
            const summary = (summaries || []).find(s => s.date === date);
            const whoop = (whoopData || []).find(w => w.date === date);
            const taskStats = tasksByDate[date] || { completed: 0, total: 0 };

            // Determine if we have data for this day
            // Calculate Day % from tasks if available (Matches MonthViewV2 logic)
            let calculatedScore = null;
            if (taskStats.total > 0) {
                calculatedScore = Math.round((taskStats.completed / taskStats.total) * 100);
            }

            // Return null if no summary and no whoop and no tasks, it's likely a future or untracked day
            // We should return null for scores to exclude from averages

            return {
                date,
                // Primary Metrics
                // Use calculated score from tasks, fallback to summary, then null
                habit_score: calculatedScore !== null ? calculatedScore : (summary ? summary.day_percentage : null),
                habit_count: taskStats.completed,

                // Whoop / Vitals
                whoop_recovery: whoop?.recovery_score ?? summary?.recovery_score ?? null,
                whoop_strain: whoop?.strain ?? summary?.strain_score ?? null,
                whoop_sleep_score: whoop?.sleep_performance ?? summary?.sleep_score ?? null,

                // Detailed Submetrics
                whoop_sleep_hours: whoop?.sleep_hours ?? null,
                whoop_hrv: whoop?.hrv ?? null,
                whoop_resting_hr: whoop?.resting_hr ?? null,
                whoop_calories: whoop?.calories_burned ?? null,

                // Advanced Sleep Metrics (for Health Analytics)
                whoop_sleep_consistency: whoop?.sleep_consistency ?? null,
                whoop_sleep_efficiency: whoop?.sleep_efficiency_percentage ?? null,
                whoop_sleep_stage_light_mins: whoop?.sleep_stage_light_minutes ?? null,
                whoop_sleep_stage_deep_mins: whoop?.sleep_stage_deep_minutes ?? null,
                whoop_sleep_stage_rem_mins: whoop?.sleep_stage_rem_minutes ?? null,
                whoop_sleep_stage_awake_mins: whoop?.sleep_stage_awake_minutes ?? null,
                whoop_sleep_debt: whoop?.sleep_debt_minutes ?? null,
                whoop_sleep_debt_corrected: whoop?.sleep_debt_corrected_minutes ?? null,
                whoop_sleep_need: whoop?.sleep_need_baseline_minutes ?? null,
                whoop_respiratory_rate: whoop?.respiratory_rate ?? null,
                whoop_skin_temp: whoop?.skin_temp_celsius ?? null,
                whoop_max_hr: whoop?.max_hr ?? null,
                whoop_average_hr: whoop?.average_hr ?? null,
                whoop_sleep_start: whoop?.sleep_start ?? null,
                whoop_sleep_end: whoop?.sleep_end ?? null,

                // Extras
                win_of_the_day: summary?.win_of_the_day,
                journal_entry: summary?.journal_entry
            };
        });

        // Sort desc
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ history });

    } catch (e: any) {
        console.error("API Error:", e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
