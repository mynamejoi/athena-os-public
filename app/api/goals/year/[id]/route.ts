import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Create a Supabase client with the Service Role key to bypass RLS
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // Updated for Next.js 15
) {
    try {
        const { id } = await context.params;
        const body = await request.json();
        const { current_value, target_value, status, title, category, unit, linked_metric } = body;

        const updateData: any = {};
        if (current_value !== undefined) updateData.current_value = current_value;
        if (target_value !== undefined) updateData.target_value = target_value;
        if (status !== undefined) updateData.status = status;
        if (title !== undefined) updateData.title = title;
        if (category !== undefined) updateData.category = category;
        if (unit !== undefined) updateData.unit = unit;
        if (linked_metric !== undefined) updateData.linked_metric = linked_metric;

        const { data, error } = await supabase
            .from('yearly_goals')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Cascade name/category/unit updates to connected monthly goals
        if (title !== undefined || category !== undefined || unit !== undefined) {
            const monthlyUpdateData: any = {};
            if (title !== undefined) monthlyUpdateData.title = title;
            if (category !== undefined) monthlyUpdateData.category = category;
            if (unit !== undefined) monthlyUpdateData.unit = unit;

            const { error: cascadeError } = await supabase
                .from('monthly_goals')
                .update(monthlyUpdateData)
                .eq('yearly_goal_id', id);

            if (cascadeError) {
                console.error('Failed to cascade yearly goal edit to monthly goals:', cascadeError);
                // We don't throw here to avoid failing the whole request if just the cascade fails,
                // but we log it.
            }
        }

        return NextResponse.json({ goal: data });
    } catch (error: any) {
        console.error('Error updating yearly goal:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // Updated for Next.js 15
) {
    try {
        const { id } = await context.params;

        const { error } = await supabase
            .from('yearly_goals')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting yearly goal:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
