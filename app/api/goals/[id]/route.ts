import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const body = await request.json();

        const allowed = {
            category: body.category, title: body.title, target_value: body.target_value,
            current_value: body.current_value, unit: body.unit, linked_metric: body.linked_metric,
            status: body.status, yearly_goal_id: body.yearly_goal_id,
        };
        const updates = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

        // 1. Update the Monthly Goal
        const { data: updatedMonthlyGoal, error: updateError } = await supabase
            .from('monthly_goals')
            .update(updates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (updateError) throw updateError;

        // 2. Roll up progress to Yearly Goal if linked
        if (updatedMonthlyGoal.yearly_goal_id) {
            // Re-calculate the yearly goal total by summing all months for this year
            const yearStr = updatedMonthlyGoal.month.substring(0, 4);
            const { data: allMonths, error: allMonthsError } = await supabase
                .from('monthly_goals')
                .select('current_value')
                .eq('yearly_goal_id', updatedMonthlyGoal.yearly_goal_id)
                .gte('month', `${yearStr}-01-01`)
                .lte('month', `${yearStr}-12-31`);

            if (!allMonthsError && allMonths) {
                const totalProgress = allMonths.reduce((sum, mg) => sum + (mg.current_value || 0), 0);

                await supabase
                    .from('yearly_goals')
                    .update({ current_value: totalProgress })
                    .eq('id', updatedMonthlyGoal.yearly_goal_id);
            }
        }

        return NextResponse.json({ goal: updatedMonthlyGoal });
    } catch (error) {
        console.error('Error updating goal:', error);
        return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { error } = await supabase
            .from('monthly_goals')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting goal:', error);
        return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
    }
}
