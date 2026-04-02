import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create table using raw SQL via supabase-js
    const { error } = await supabase.from('golf_rounds').select('id').limit(1);

    if (error && error.message.includes('does not exist')) {
        // Table doesn't exist, need to create it via SQL
        // We'll use the postgres connection through supabase
        const createSQL = `
            CREATE TABLE IF NOT EXISTS public.golf_rounds (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id uuid NOT NULL,
                workout_id text NOT NULL,
                score integer,
                course_name text,
                notes text,
                created_at timestamptz DEFAULT now()
            );
        `;

        // Use supabase SQL execution
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: createSQL })
        });

        return NextResponse.json({
            status: 'table_creation_needed',
            message: 'Please create the golf_rounds table manually in Supabase dashboard',
            sql: createSQL
        });
    }

    return NextResponse.json({ status: 'ok', message: 'Table already exists' });
}
