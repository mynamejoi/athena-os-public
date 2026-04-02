
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function POST(request: Request) {
    const body = await request.json();

    const allowed = {
        name: body.name, description: body.description, overview: body.overview,
        status: body.status, progress: body.progress, due_date: body.due_date,
        deadline: body.deadline, milestones: body.milestones, color: body.color, emoji: body.emoji,
    };
    const filtered = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
        .from('projects')
        .insert([{
            ...filtered,
            user_id: 'anon'
        }])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function PATCH(request: Request) {
    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: 'Project id is required' }, { status: 400 });

    const allowed = {
        name: body.name, description: body.description, overview: body.overview,
        status: body.status, progress: body.progress, due_date: body.due_date,
        deadline: body.deadline, milestones: body.milestones, color: body.color, emoji: body.emoji,
    };
    const updates = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
