import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';
import { toETDateString } from '@/lib/date-utils';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, serviceKey);

        // Get last 30 days of data
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const startDate = toETDateString(thirtyDaysAgo);
        const endDate = toETDateString(today);

        // Fetch whoop data for the last 30 days
        const { data: whoopData, error: whoopError } = await supabase
            .from('whoop_data')
            .select('date, recovery_score, strain, sleep_performance, hrv')
            .eq('user_id', SINGLE_USER_ID)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: false })
            .limit(30);

        if (whoopError) {
            // Fallback: try without user_id filter
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('whoop_data')
                .select('date, recovery_score, strain, sleep_performance, hrv')
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false })
                .limit(30);

            if (fallbackError) throw fallbackError;
            return NextResponse.json({ baselines: calculateBaselines(fallbackData || []) });
        }

        return NextResponse.json({ baselines: calculateBaselines(whoopData || []) });

    } catch (e: any) {
        console.error("Baselines API Error:", e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

function calculateBaselines(data: any[]) {
    const sorted = [...data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const last7 = sorted.slice(0, 7);
    const last30 = sorted;

    const avg = (items: any[], key: string): number | null => {
        const values = items.map(d => d[key]).filter((v): v is number => v != null && !isNaN(v));
        if (values.length === 0) return null;
        return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
    };

    return {
        recovery: { avg7: avg(last7, 'recovery_score'), avg30: avg(last30, 'recovery_score') },
        strain: { avg7: avg(last7, 'strain'), avg30: avg(last30, 'strain') },
        sleep_score: { avg7: avg(last7, 'sleep_performance'), avg30: avg(last30, 'sleep_performance') },
        hrv: { avg7: avg(last7, 'hrv'), avg30: avg(last30, 'hrv') },
    };
}
