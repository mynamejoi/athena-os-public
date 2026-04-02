import { SupabaseClient } from '@supabase/supabase-js';
import { toETDateString, getETYesterday, getETDayOfWeek, formatDateStr } from '@/lib/date-utils';

/**
 * Builds full context and generates pre-workout coach notes via the coach API.
 * Used by WHOOP sync auto-generation (both Sunday post-plan and daily safety net).
 * Returns the coach response data, or null if the call failed.
 */
export async function generatePreCoachNotes({
    supabase,
    userId,
    workoutType,
    weekPlanNote,
    baseUrl,
}: {
    supabase: SupabaseClient;
    userId: string;
    workoutType: string;
    weekPlanNote?: string | null;
    baseUrl: string;
}): Promise<any | null> {
    const now = new Date();
    const todayStr = toETDateString(now);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
    const twoWeeksAgoStr = toETDateString(twoWeeksAgo);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const thirtyDaysAgoStr = toETDateString(thirtyDaysAgo);

    // ── Parallel data fetch ──
    const yesterdayStr = getETYesterday(now);

    const [
        { data: recentWorkouts },
        { data: todayBio },
        { data: yesterdayBio },
        { data: yesterdayWorkout },
        { data: prevCoachNotes },
        { data: whoopTrendData },
    ] = await Promise.all([
        supabase.from('whoop_workouts')
            .select('id, date, workout_label, strain, duration_minutes')
            .eq('user_id', userId)
            .gte('date', twoWeeksAgoStr)
            .order('date', { ascending: false })
            .limit(20),
        supabase.from('whoop_data')
            .select('*')
            .eq('date', todayStr)
            .maybeSingle(),
        supabase.from('whoop_data')
            .select('strain, recovery_score')
            .eq('date', yesterdayStr)
            .maybeSingle(),
        supabase.from('whoop_workouts')
            .select('workout_label')
            .eq('user_id', userId)
            .eq('date', yesterdayStr)
            .limit(1)
            .maybeSingle(),
        supabase.from('coach_notes')
            .select('coach_type, notes, exercise_suggestions, weight_notes, intensity, created_at')
            .eq('workout_type', workoutType)
            .lt('created_at', todayStr + 'T00:00:00')
            .order('created_at', { ascending: false })
            .limit(6),
        supabase.from('whoop_data')
            .select('date, hrv, resting_hr, recovery_score')
            .gte('date', twoWeeksAgoStr)
            .lte('date', todayStr)
            .order('date', { ascending: true }),
    ]);

    // ── Filter to same workout type ──
    const typeKeyword = workoutType.toLowerCase().replace(/[()]/g, '');
    const sameTypeWorkouts = (recentWorkouts || []).filter(w => {
        const label = (w.workout_label || '').toLowerCase();
        return label.includes(typeKeyword);
    }).slice(0, 3);

    // ── Fetch exercises for recent same-type workouts ──
    const recentHistory = await Promise.all(sameTypeWorkouts.map(async (w) => {
        const { data: exs } = await supabase.from('workout_exercises')
            .select('exercise_name, set_entries')
            .eq('workout_id', w.id);
        return { ...w, exercises: exs || [] };
    }));

    // ── Template from latest workout ──
    let template: { exercise_name: string }[] = [];
    if (recentHistory.length > 0 && recentHistory[0].exercises.length > 0) {
        template = recentHistory[0].exercises.map(e => ({ exercise_name: e.exercise_name }));
    }

    // ── Days since last same-type workout ──
    const lastSameType = sameTypeWorkouts[0];
    const daysSinceLast = lastSameType
        ? Math.floor((now.getTime() - new Date(lastSameType.date).getTime()) / (1000 * 60 * 60 * 24))
        : null;

    // ── Weekly load ──
    const etDayOfWeek = getETDayOfWeek(now);
    const todayDateObj = new Date(todayStr + 'T12:00:00');
    const weekStart = new Date(todayDateObj);
    weekStart.setDate(todayDateObj.getDate() - etDayOfWeek);
    const weekStartStr = formatDateStr(weekStart);
    const { data: weekWorkouts } = await supabase.from('whoop_workouts')
        .select('strain')
        .eq('user_id', userId)
        .gte('date', weekStartStr);
    const weeklyAccumulatedStrain = (weekWorkouts || []).reduce((s, w) => s + (w.strain || 0), 0);
    const weeklySessionCount = (weekWorkouts || []).length;

    // ── Progressive overload analysis ──
    const progressiveOverload: Record<string, any> = {};
    if (recentHistory.length >= 2) {
        const latest = recentHistory[0];
        const previous = recentHistory[1];
        for (const ex of latest.exercises) {
            const prevEx = previous.exercises.find((e: any) => e.exercise_name === ex.exercise_name);
            const sets = ex.set_entries || [];
            const maxWeight = Math.max(...sets.map((s: any) => s.weight || 0), 0);
            const totalVolume = sets.reduce((v: number, s: any) => v + ((s.sets || 1) * (s.reps || 0) * (s.weight || 0)), 0);

            let prevMaxWeight = 0;
            let prevVolume = 0;
            if (prevEx) {
                const prevSets = prevEx.set_entries || [];
                prevMaxWeight = Math.max(...prevSets.map((s: any) => s.weight || 0), 0);
                prevVolume = prevSets.reduce((v: number, s: any) => v + ((s.sets || 1) * (s.reps || 0) * (s.weight || 0)), 0);
            }

            // Check for plateau (same max weight 3+ sessions)
            let plateauCount = 0;
            for (const h of recentHistory) {
                const hEx = h.exercises.find((e: any) => e.exercise_name === ex.exercise_name);
                if (hEx) {
                    const hMax = Math.max(...(hEx.set_entries || []).map((s: any) => s.weight || 0), 0);
                    if (hMax === maxWeight) plateauCount++;
                }
            }

            progressiveOverload[ex.exercise_name] = {
                prWeight: maxWeight,
                currentWeight: maxWeight,
                currentVolume: totalVolume,
                volumeTrend: prevVolume > 0 ? totalVolume - prevVolume : 0,
                isPR: prevMaxWeight > 0 && maxWeight > prevMaxWeight,
                isVolumePR: prevVolume > 0 && totalVolume > prevVolume,
                plateau: plateauCount >= 3,
                sessions: recentHistory.length,
            };
        }
    }

    // ── Sibling workout context ──
    const SIBLING_MAP: Record<string, string> = {
        'Push (Chest)': 'Push (Tricep)',
        'Push (Tricep)': 'Push (Chest)',
        'Pull (Back)': 'Pull (Bicep)',
        'Pull (Bicep)': 'Pull (Back)',
    };
    let siblingContext: { type: string; exercises: string[] } | null = null;
    const siblingType = SIBLING_MAP[workoutType];
    if (siblingType) {
        const siblingKeyword = siblingType.toLowerCase().replace(/[()]/g, '');
        const siblingWorkout = (recentWorkouts || []).find(w => {
            const label = (w.workout_label || '').toLowerCase();
            return label.includes(siblingKeyword);
        });
        if (siblingWorkout) {
            const { data: sibExs } = await supabase.from('workout_exercises')
                .select('exercise_name')
                .eq('workout_id', siblingWorkout.id);
            siblingContext = {
                type: siblingType,
                exercises: (sibExs || []).map(e => e.exercise_name),
            };
        }
    }

    // ── WHOOP trends (14-day baseline vs 3-day recent) ──
    let whoopTrends: any = undefined;
    const trendRows = whoopTrendData || [];
    if (trendRows.length >= 7) {
        const recent3 = trendRows.slice(-3);
        const baseline = trendRows.slice(0, -3);

        const avg = (arr: any[], key: string) => {
            const vals = arr.map(r => r[key]).filter((v: any) => v != null);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
        };

        const hrvBaseline = avg(baseline, 'hrv');
        const hrv3Day = avg(recent3, 'hrv');
        const recoveryBaseline = avg(baseline, 'recovery_score');
        const recovery3Day = avg(recent3, 'recovery_score');
        const restingHrBaseline = avg(baseline, 'resting_hr');
        const restingHr3Day = avg(recent3, 'resting_hr');

        const trend = (recent: number | null, base: number | null) => {
            if (recent == null || base == null) return null;
            const diff = ((recent - base) / base) * 100;
            return diff > 3 ? 'rising' : diff < -3 ? 'falling' : 'stable';
        };

        whoopTrends = {
            hrvBaseline, hrv3Day, hrvTrend: trend(hrv3Day, hrvBaseline),
            recoveryBaseline, recovery3Day, recoveryTrend: trend(recovery3Day, recoveryBaseline),
            restingHrBaseline, restingHr3Day, restingHrTrend: trend(restingHr3Day, restingHrBaseline),
        };
    }

    // ── Prior day context ──
    const priorDayStrain = yesterdayBio?.strain ?? null;
    const priorDayWorkoutType = yesterdayWorkout?.workout_label ?? null;

    // ── Call coach endpoint ──
    const coachRes = await fetch(`${baseUrl}/api/productivity/workouts/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'pre',
            workoutType,
            recoveryScore: todayBio?.recovery_score ?? null,
            sleepHours: todayBio?.sleep_hours ?? null,
            sleepPerformance: todayBio?.sleep_performance ?? null,
            hrv: todayBio?.hrv ?? null,
            restingHr: todayBio?.resting_hr ?? null,
            sleepDebt: todayBio?.sleep_debt_minutes ?? null,
            skinTemp: todayBio?.skin_temp_celsius ?? null,
            respiratoryRate: todayBio?.respiratory_rate ?? null,
            priorDayStrain,
            priorDayWorkoutType,
            template,
            recentHistory,
            previousCoachNotes: prevCoachNotes || [],
            progressiveOverload,
            siblingContext,
            whoopTrends,
            daysSinceLast,
            weeklyAccumulatedStrain,
            weeklySessionCount,
            weekPlanNote: weekPlanNote || null,
        }),
    });

    if (!coachRes.ok) return null;

    const coachData = await coachRes.json();

    // ── Store in DB ──
    await supabase.from('coach_notes').insert({
        workout_type: workoutType,
        coach_type: 'pre',
        notes: coachData.notes || [],
        exercise_suggestions: coachData.exerciseSuggestions || [],
        weight_notes: coachData.weightNotes || {},
        next_session_targets: coachData.nextSessionTargets || {},
        intensity: coachData.intensity || 'maintain',
        warm_up: coachData.warmUp || {},
        exercise_order: coachData.exerciseOrder || [],
        warnings: coachData.warnings || [],
    });

    return coachData;
}
