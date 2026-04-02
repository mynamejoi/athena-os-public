
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/productivity/tasks
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('project_id');
    const status = searchParams.get('status');

    // const supabase = createClient(); // Removed
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

    if (projectId) query = query.eq('project_id', projectId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// POST /api/productivity/tasks
export async function POST(request: Request) {
    const body = await request.json();

    const allowed = {
        name: body.name, description: body.description, status: body.status,
        priority: body.priority, due_date: body.due_date, start_date: body.start_date,
        project_id: body.project_id, section_id: body.section_id, parent_id: body.parent_id,
        dependencies: body.dependencies, is_brain_dump_item: body.is_brain_dump_item,
    };
    const filtered = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
        .from('tasks')
        .insert([{
            ...filtered,
            user_id: 'anon' // Default for now
        }])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// PATCH /api/productivity/tasks (for updating status, etc)
export async function PATCH(request: Request) {
    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const allowed = {
        name: body.name, description: body.description, status: body.status,
        priority: body.priority, due_date: body.due_date, start_date: body.start_date,
        completed_at: body.completed_at, project_id: body.project_id, section_id: body.section_id,
        parent_id: body.parent_id, dependencies: body.dependencies,
    };
    const updates = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// DELETE /api/productivity/tasks
export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const { error } = await supabase.from('tasks').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
