
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';
import { toETDateString } from '@/lib/date-utils';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    // Use Service Role to bypass RLS, ensuring we can read the hardcoded user's data
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Single User Mode
    const userId = SINGLE_USER_ID;

    try {
        let query = supabase
            .from('whoop_workouts')
            .select('*')
            .eq('user_id', userId);

        // Apply date filters if provided, otherwise default to last 30 days
        if (startDate) {
            query = query.gte('date', startDate);
        } else {
            const thirtyDaysAgo = toETDateString(new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)));
            query = query.gte('date', thirtyDaysAgo);
        }

        if (endDate) {
            query = query.lte('date', endDate);
        }

        const { data: workouts, error } = await query.order('date', { ascending: true });

        if (error) {
            console.error('[Workouts API] Error fetching workouts:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Sanitize 'Sport -1' to 'General Activity'
        const sanitizedWorkouts = (workouts || []).map((w: any) => ({
            ...w,
            sport_name: (w.sport_name === 'Sport -1' || w.sport_id === -1) ? 'General Activity' : w.sport_name
        }));

        // Aggregate by sport and date
        const aggregated: { [date: string]: { [sport: string]: { count: number; total_duration: number; total_strain: number } } } = {};
        const summary: { [sport: string]: { total_sessions: number; total_duration: number; total_strain: number } } = {};

        for (const workout of sanitizedWorkouts) {
            const date = workout.date;
            const sport = workout.sport_name;

            // Initialize structures
            if (!aggregated[date]) aggregated[date] = {};
            if (!aggregated[date][sport]) aggregated[date][sport] = { count: 0, total_duration: 0, total_strain: 0 };
            if (!summary[sport]) summary[sport] = { total_sessions: 0, total_duration: 0, total_strain: 0 };

            // Aggregate
            aggregated[date][sport].count++;
            aggregated[date][sport].total_duration += workout.duration_minutes || 0;
            aggregated[date][sport].total_strain += workout.strain || 0;

            summary[sport].total_sessions++;
            summary[sport].total_duration += workout.duration_minutes || 0;
            summary[sport].total_strain += workout.strain || 0;
        }

        // Convert to array format
        const workoutData = Object.entries(aggregated).flatMap(([date, sports]) =>
            Object.entries(sports).map(([sport_name, data]) => ({
                date,
                sport_name,
                count: data.count,
                total_duration: data.total_duration,
                total_strain: data.total_strain,
            }))
        );

        // Calculate averages for summary
        const summaryWithAvg = Object.fromEntries(
            Object.entries(summary).map(([sport, data]) => [
                sport,
                {
                    ...data,
                    avg_strain: data.total_sessions > 0 ? data.total_strain / data.total_sessions : 0,
                },
            ])
        );

        return NextResponse.json({
            workouts: sanitizedWorkouts, // Return sanitized workouts for detailed breakdown
            aggregates: workoutData, // Keep aggregates if needed
            summary: summaryWithAvg,
        });
    } catch (error: any) {
        console.error('[Workouts API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
