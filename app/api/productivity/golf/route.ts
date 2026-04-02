import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const workoutId = searchParams.get('workout_id');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (workoutId) {
        const { data, error } = await supabase
            .from('golf_rounds')
            .select('*')
            .eq('workout_id', workoutId)
            .eq('user_id', SINGLE_USER_ID)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ round: data });
    }

    // Get all rounds for chart history
    const { data, error } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('user_id', SINGLE_USER_ID)
        .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rounds: data || [] });
}

export async function POST(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const body = await request.json();
        const { workout_id, course_name, holes, notes } = body;

        if (!workout_id) {
            return NextResponse.json({ error: 'workout_id is required' }, { status: 400 });
        }

        const { data: existing } = await supabase
            .from('golf_rounds')
            .select('id')
            .eq('workout_id', workout_id)
            .eq('user_id', SINGLE_USER_ID)
            .maybeSingle();

        const payload = { course_name, holes: holes || [], notes };

        if (existing) {
            const { data, error } = await supabase
                .from('golf_rounds')
                .update(payload)
                .eq('id', existing.id)
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ round: data });
        } else {
            const { data, error } = await supabase
                .from('golf_rounds')
                .insert({ user_id: SINGLE_USER_ID, workout_id, ...payload })
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ round: data });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
