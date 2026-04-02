
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/productivity/habits?month=2024-10
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // Expect 'YYYY-MM'

    // const supabase = createClient();

    // Simplistic fetch all for now, filter by date range later if needed
    let query = supabase.from('habits_daily').select('*').order('date', { ascending: true });

    // In a real app we'd filter by date range [startOfMonth, endOfMonth]
    // if (month) ...

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function POST(request: Request) {
    const body = await request.json();
    // const supabase = createClient();

    // Upsert based on date + user_id unique constraint
    const allowed = {
        date: body.date, mood: body.mood, energy_level: body.energy_level,
        productivity_score: body.productivity_score, habits_completed: body.habits_completed,
        bad_habits: body.bad_habits, notes: body.notes,
    };
    const filtered = Object.fromEntries(Object.entries(allowed).filter(([_, v]) => v !== undefined));

    const { data, error } = await supabase
        .from('habits_daily')
        .upsert([{
            ...filtered,
            user_id: 'anon'
        }], { onConflict: 'user_id,date' })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}
