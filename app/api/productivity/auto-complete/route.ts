
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

// Force dynamic since we use date/time
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { date, userId } = body;

        if (!date) {
            return NextResponse.json({ error: 'Missing date' }, { status: 400 });
        }

        // Use Service Role to bypass RLS issues that might be hiding workout data
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // Use provided userId or fall back to single-user default
        const targetUserId = userId || SINGLE_USER_ID;

        // 1. Fetch Data Srouces (Workouts, Whoop Data, Daily Tasks)
        const [
            { data: workoutData },
            { data: whoopData },
            { data: dailyTasks }
        ] = await Promise.all([
            supabase.from('whoop_workouts').select('*').eq('date', date).eq('user_id', targetUserId),
            supabase.from('whoop_data').select('*').eq('date', date).eq('user_id', targetUserId).maybeSingle(),
            supabase.from('daily_tasks').select('*').eq('date', date).eq('status', 'Pending') // Only fetch Pending
        ]);

        if (!dailyTasks || dailyTasks.length === 0) {
            return NextResponse.json({ success: true, updates: [] });
        }

        const updates: string[] = [];

        // 2. Apply Auto-Complete Logic

        // A. Sleep Check (6+ Hours)
        if (whoopData && whoopData.sleep_hours >= 6) {
            const sleepTask = dailyTasks.find(t => t.title.toLowerCase().includes('6+ hour sleep'));
            if (sleepTask) updates.push(sleepTask.id);
        }

        // B. Workout Checks
        if (workoutData && workoutData.length > 0) {
            const hasGym = workoutData.some((w: any) => w.sport_name === 'Functional Fitness');
            const hasSauna = workoutData.some((w: any) => w.sport_name === 'Dry Sauna' || w.sport_name === 'Sauna');
            const hasPlunge = workoutData.some((w: any) => w.sport_name === 'Ice Bath');

            if (hasGym) {
                // Gym, Push/Pull/Leg, Strength
                const gymTasks = dailyTasks.filter(t => {
                    const title = t.title.toLowerCase();
                    return title === 'gym' || title === 'workout' || title.startsWith('push') || title.startsWith('pull') || title === 'legs' || title.includes('push day') || title.includes('pull day') || title.includes('leg day') || title.includes('strength');
                });
                gymTasks.forEach(t => updates.push(t.id));
            }

            if (hasSauna) {
                const saunaTasks = dailyTasks.filter(t => t.title.toLowerCase().includes('sauna'));
                saunaTasks.forEach(t => updates.push(t.id));
            }

            if (hasPlunge) {
                const plungeTasks = dailyTasks.filter(t => {
                    const title = t.title.toLowerCase();
                    return title.includes('cold plunge') || title.includes('ice bath');
                });
                plungeTasks.forEach(t => updates.push(t.id));
            }
        }

        // 3. Perform Updates
        if (updates.length > 0) {
            const { error } = await supabase
                .from('daily_tasks')
                .update({ status: 'Completed' })
                .in('id', updates);

            if (error) {
                console.error('[Auto-Complete] DB Update Error:', error);
                throw error;
            }
        } else {
        }

        return NextResponse.json({ success: true, updates, count: updates.length });

    } catch (e: any) {
        console.error('[Auto-Complete] Error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
