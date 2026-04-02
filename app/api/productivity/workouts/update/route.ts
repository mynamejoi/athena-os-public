import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function PATCH(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const body = await request.json();
        const { workout_id, workout_label, notes } = body;

        if (!workout_id) {
            return NextResponse.json({ error: 'workout_id is required' }, { status: 400 });
        }

        const updatePayload: Record<string, any> = {};
        if (workout_label !== undefined) {
            updatePayload.workout_label = workout_label || null;
            updatePayload.label_locked = true;
        }
        if (notes !== undefined) {
            updatePayload.notes = notes || null;
        }

        const { data, error } = await supabase
            .from('whoop_workouts')
            .update(updatePayload)
            .eq('id', workout_id)
            .eq('user_id', SINGLE_USER_ID)
            .select()
            .single();

        if (error) {
            console.error('[Workouts API] Update error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ workout: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
