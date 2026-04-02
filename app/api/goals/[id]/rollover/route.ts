import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { addMonths, format, parseISO } from 'date-fns';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    // Verify Env Vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use Service Role to bypass all RLS/Auth checks
    const supabase = createClient(supabaseUrl, serviceKey);

    // Single User Mode
    const user = { id: SINGLE_USER_ID };

    const { id } = await params;

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch the goal to carry over
        const { data: oldGoal, error: fetchError } = await supabase
            .from('monthly_goals')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !oldGoal) {
            throw new Error('Goal not found');
        }

        if (oldGoal.yearly_goal_id) {
            throw new Error('Yearly goals dynamically auto-rollover and cannot be manually forwarded.');
        }

        // 2. Archive the old goal so it disappears from active view
        const { error: archiveError } = await supabase
            .from('monthly_goals')
            .update({ status: 'archived' })
            .eq('id', id);

        if (archiveError) throw archiveError;

        // 3. Calculate next month
        const currentMonthDate = parseISO(oldGoal.month);
        const nextMonthDate = addMonths(currentMonthDate, 1);
        const nextMonthString = format(nextMonthDate, 'yyyy-MM-01');

        // 4. Create the duplicate goal for the next month
        const { data: newGoal, error: createError } = await supabase
            .from('monthly_goals')
            .insert({
                user_id: user.id,
                month: nextMonthString,
                category: oldGoal.category,
                title: oldGoal.title,
                target_value: oldGoal.target_value,
                current_value: 0, // Reset progress for the new month
                unit: oldGoal.unit,
                linked_metric: oldGoal.linked_metric,
                carried_from_id: oldGoal.id
            })
            .select()
            .single();

        if (createError) throw createError;

        return NextResponse.json({ success: true, goal: newGoal });
    } catch (error) {
        console.error('Error rolling over goal:', error);
        return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
    }
}
