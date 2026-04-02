import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        const [whoopResult, habitResult, workoutResult] = await Promise.all([
            // Count distinct dates in whoop_data
            supabase
                .from('whoop_data')
                .select('date')
                .eq('user_id', SINGLE_USER_ID)
                .order('date', { ascending: true }),

            // Count distinct dates in daily_tasks with at least one completed task
            supabase
                .from('daily_tasks')
                .select('date')
                .eq('status', 'Completed')
                .order('date', { ascending: true }),

            // Count distinct dates in whoop_workouts
            supabase
                .from('whoop_workouts')
                .select('date')
                .eq('user_id', SINGLE_USER_ID)
                .order('date', { ascending: true }),
        ]);

        if (whoopResult.error) throw whoopResult.error;
        if (habitResult.error) throw habitResult.error;
        if (workoutResult.error) throw workoutResult.error;

        const uniqueDates = (rows: { date: string }[]) => new Set(rows.map(r => r.date));

        const whoopDates = uniqueDates(whoopResult.data || []);
        const habitDates = uniqueDates(habitResult.data || []);
        const workoutDates = uniqueDates(workoutResult.data || []);

        const whoopDays = whoopDates.size;
        const habitDays = habitDates.size;
        const workoutDays = workoutDates.size;

        // Total active days = union of all date sets (days with ANY activity)
        const allUniqueDates = new Set([...whoopDates, ...habitDates, ...workoutDates]);
        const allDatesSorted = [...allUniqueDates].sort();
        const firstDataDate = allDatesSorted.length > 0 ? allDatesSorted[0] : null;
        const totalDays = allUniqueDates.size;

        const hasWhoop = whoopDays > 0;

        return NextResponse.json({
            whoopDays,
            habitDays,
            workoutDays,
            firstDataDate,
            totalDays,
            hasWhoop,
        });

    } catch (e: any) {
        console.error("Data Maturity API Error:", e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
