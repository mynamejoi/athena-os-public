import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const workoutId = searchParams.get('workout_id');

    if (!workoutId) {
        return NextResponse.json({ error: 'workout_id is required' }, { status: 400 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
        .from('workout_exercises')
        .select('*')
        .eq('workout_id', workoutId)
        .eq('user_id', SINGLE_USER_ID)
        .order('order_index', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ exercises: data || [] });
}

export async function POST(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const body = await request.json();
        const { workout_id, exercises } = body;

        if (!workout_id || !exercises) {
            return NextResponse.json({ error: 'workout_id and exercises are required' }, { status: 400 });
        }

        // Delete existing exercises for this workout and re-insert
        await supabase
            .from('workout_exercises')
            .delete()
            .eq('workout_id', workout_id)
            .eq('user_id', SINGLE_USER_ID);

        // If no exercises to insert, return early (all cleared)
        if (exercises.length === 0) {
            return NextResponse.json({ exercises: [] });
        }

        const payload = exercises.map((ex: any, idx: number) => ({
            user_id: SINGLE_USER_ID,
            workout_id,
            exercise_name: ex.exercise_name,
            set_entries: ex.set_entries || [],
            weight_unit: ex.weight_unit || 'lbs',
            notes: ex.notes || null,
            order_index: idx
        }));

        const { data, error } = await supabase
            .from('workout_exercises')
            .insert(payload)
            .select();

        if (error) {
            console.error('[Exercises API] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ exercises: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
