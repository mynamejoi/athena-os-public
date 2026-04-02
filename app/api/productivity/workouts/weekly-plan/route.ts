import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { generateCompletion } from '@/lib/llm';
import { logUsage } from '@/lib/usage';
import { SINGLE_USER_ID } from '@/lib/constants';
import { startOfWeek, format } from 'date-fns';

function getWeekStart(date?: string): string {
    const d = date ? new Date(date + 'T12:00:00') : new Date();
    const sunday = startOfWeek(d, { weekStartsOn: 0 });
    return format(sunday, 'yyyy-MM-dd');
}

const MODEL = 'claude-haiku-4-5-20251001';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const weekStart = getWeekStart();

    const { data, error } = await supabase
        .from('workout_weekly_plans')
        .select('*')
        .eq('user_id', SINGLE_USER_ID)
        .eq('week_start', weekStart)
        .maybeSingle();

    if (error) {
        console.error('Weekly plan GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ plan: null, reasoning: null, gapAlert: null });
    }

    return NextResponse.json({
        plan: data.plan,
        reasoning: data.reasoning,
        gapAlert: data.gap_alert,
        model: data.model,
        weekStart: data.week_start,
    });
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const weekStart = getWeekStart(body.weekStart);
        const lockedDays: Record<string, string> | undefined = body.lockedDays;

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // ── Gather context ──

        // 1. Last 2 weeks of workouts from whoop_workouts
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const twoWeeksAgoStr = format(twoWeeksAgo, 'yyyy-MM-dd');
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        const [
            { data: recentWorkouts },
            { data: whoopData },
            { data: workoutExercises },
        ] = await Promise.all([
            supabase
                .from('whoop_workouts')
                .select('id, date, sport_name, workout_label, strain, duration_minutes')
                .eq('user_id', SINGLE_USER_ID)
                .gte('date', twoWeeksAgoStr)
                .lte('date', todayStr)
                .order('date', { ascending: false }),
            supabase
                .from('whoop_data')
                .select('date, recovery_score, hrv, resting_hr, strain, sleep_hours, sleep_performance')
                .gte('date', format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'))
                .lte('date', todayStr)
                .order('date', { ascending: false })
                .limit(7),
            supabase
                .from('workout_exercises')
                .select('workout_id, exercise_name')
                .limit(200),
        ]);

        // 2. Determine workout types and days since each
        const WORKOUT_TYPES = ['Push (Chest)', 'Push (Tricep)', 'Pull (Back)', 'Pull (Bicep)', 'Legs'];
        const now = new Date();

        // Normalize workout labels
        const normalizedWorkouts = (recentWorkouts || []).map(w => {
            let type = w.workout_label || w.sport_name || 'Other';
            if (/push.*chest/i.test(type)) type = 'Push (Chest)';
            else if (/push.*tricep/i.test(type)) type = 'Push (Tricep)';
            else if (/pull.*back/i.test(type)) type = 'Pull (Back)';
            else if (/pull.*bicep/i.test(type)) type = 'Pull (Bicep)';
            else if (/leg/i.test(type)) type = 'Legs';
            else if (/cardio|running|cycling/i.test(type)) type = 'Cardio';
            return { ...w, displayType: type };
        });

        const daysSinceEach: Record<string, number | null> = {};
        WORKOUT_TYPES.forEach(t => {
            const last = normalizedWorkouts.find(w => w.displayType === t);
            if (last) {
                daysSinceEach[t] = Math.floor((now.getTime() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24));
            } else {
                daysSinceEach[t] = null;
            }
        });

        // 3. Recent week patterns (last 3 weeks)
        const recentWeekPatterns: any[] = [];
        for (let w = 0; w < 3; w++) {
            const ws = new Date(now);
            ws.setDate(ws.getDate() - ws.getDay() - (w * 7));
            const days: Record<string, string> = {};
            for (let d = 0; d < 7; d++) {
                const day = new Date(ws);
                day.setDate(day.getDate() + d);
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayLabel = format(day, 'EEE');
                const workout = normalizedWorkouts.find(nw => nw.date === dateStr);
                if (workout) days[dayLabel] = workout.displayType;
            }
            if (Object.keys(days).length > 0) {
                recentWeekPatterns.push({
                    label: format(ws, 'MMM d') + ' - ' + format(new Date(ws.getTime() + 6 * 86400000), 'MMM d'),
                    days,
                });
            }
        }

        // 4. Recovery trends from whoop_data
        const recoveryValues = (whoopData || []).map(d => d.recovery_score).filter((v): v is number => v != null);
        const hrvValues = (whoopData || []).map(d => d.hrv).filter((v): v is number => v != null);
        const avgRecovery = recoveryValues.length > 0 ? recoveryValues.reduce((a, b) => a + b, 0) / recoveryValues.length : null;
        const avgHrv = hrvValues.length > 0 ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length : null;
        const hrvTrend = hrvValues.length >= 3
            ? (hrvValues[0] > hrvValues[hrvValues.length - 1] ? 'rising' : hrvValues[0] < hrvValues[hrvValues.length - 1] ? 'falling' : 'stable')
            : null;

        // 5. Accumulated strain this week
        const currentWeekStart = new Date(now);
        currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
        const weeklyAccumulatedStrain = normalizedWorkouts
            .filter(w => new Date(w.date) >= currentWeekStart)
            .reduce((sum, w) => sum + (w.strain || 0), 0);

        // 6. Muscle groups hit recently
        const muscleGroupContext = Object.entries(daysSinceEach)
            .map(([type, days]) => `- ${type}: ${days === null ? 'Never done' : `${days} days ago`}`)
            .join('\n');

        // 7. Available training days (all days — AI determines rest days from recovery data)
        const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const availableGymDays: string[] = DAY_NAMES;

        // ── Build AI Prompt ──
        let context = `## Available Workout Types:\n${WORKOUT_TYPES.join(', ')}\n`;

        context += `\n## Available Training Days:\nThe athlete's gym schedule is set for: ${availableGymDays.join(', ')}\nDays NOT listed here MUST be Rest days. Do NOT schedule workouts on off days.\n`;

        context += `\n## Days Since Last Session (per type):\n${muscleGroupContext}\n`;

        if (recentWeekPatterns.length > 0) {
            context += `\n## Recent Weekly Patterns (last 3 weeks, most recent first):\n`;
            recentWeekPatterns.forEach((week, i) => {
                context += `\nWeek ${i + 1} (${week.label}):\n`;
                Object.entries(week.days).forEach(([day, type]) => {
                    context += `  ${day}: ${type}\n`;
                });
            });
        }

        context += `\n## Recovery Trends (last 7 days):\n`;
        if (avgRecovery != null) context += `- Average Recovery: ${avgRecovery.toFixed(0)}%\n`;
        if (avgHrv != null) context += `- Average HRV: ${avgHrv.toFixed(0)}ms\n`;
        if (hrvTrend) context += `- HRV trend: ${hrvTrend}\n`;
        context += `- Accumulated strain this week so far: ${weeklyAccumulatedStrain.toFixed(1)}\n`;

        if (whoopData && whoopData.length > 0) {
            context += `\n## Last 7 Days Biometrics:\n`;
            whoopData.forEach(d => {
                context += `  ${d.date}: Recovery ${d.recovery_score ?? '?'}%, HRV ${d.hrv ?? '?'}ms, Sleep ${d.sleep_hours?.toFixed(1) ?? '?'}h\n`;
            });
        }

        // Build locked days context for re-optimization
        let lockedDaysPrompt = '';
        if (lockedDays && Object.keys(lockedDays).length > 0) {
            lockedDaysPrompt = `\n\n## LOCKED DAYS (already occurred — DO NOT change these):\nThe following days have already occurred and MUST remain exactly as shown. Only plan the remaining days.\n`;
            Object.entries(lockedDays).forEach(([day, type]) => {
                lockedDaysPrompt += `  ${day}: ${type}\n`;
            });
            context += lockedDaysPrompt;
        }

        const systemPrompt = `You are an elite strength coach planning this athlete's optimal training week (Sunday through Saturday). You know their full workout history, recovery data, and training patterns.

The athlete trains 5 days per week. This is the target — plan exactly 5 training sessions unless recovery is critically low (below 25% average).

RESPOND WITH ONLY VALID JSON (no markdown, no code fences):

{
  "plan": {
    "Sun": { "type": "Rest", "note": "Recovery day" },
    "Mon": { "type": "Push (Chest)", "note": "Focus on bench progression" },
    "Tue": { "type": "Pull (Back)", "note": "Deadlift + rows" },
    "Wed": { "type": "Rest", "note": "Recovery day" },
    "Thu": { "type": "Legs", "note": "Squat focus" },
    "Fri": { "type": "Push (Tricep)", "note": "Overhead press + isolation" },
    "Sat": { "type": "Pull (Bicep)", "note": "Chin-ups + curls" }
  },
  "reasoning": "1-2 sentences. Why this split order is optimal this week.",
  "gapAlert": "1 sentence if any muscle group is notably undertrained, otherwise null"
}

RULES:
1. Use ONLY the workout types listed in "Available Workout Types" or "Rest" for rest days — use them EXACTLY as written.
2. Schedule exactly 5 training days and 2 rest days. Do NOT suggest walks, yoga, or "active recovery" as substitutes for training. Rest days are rest — nothing scheduled.
3. Space similar muscle groups apart — at least 48 hours between same group (e.g., don't put Push (Chest) and Push (Tricep) on consecutive days).
4. Recovery data informs WHICH workout goes on which day, not WHETHER to train. Low recovery day = place an easier session there, not a rest day.
5. Types with more days since last session should get priority.
6. Respect the athlete's existing patterns from recent weeks — they have preferred training rhythms.
7. Place the most demanding sessions (Legs, heavy compounds) on days when recovery is typically highest (often mid-week after a rest day).
8. gapAlert should be null unless a type genuinely hasn't been trained in 10+ days.
9. Each day must have both a "type" and a "note" field. The note should be 3-8 words giving context.
10. CRITICAL: Only schedule workouts on the days listed in "Available Training Days". All other days MUST be "Rest". Never schedule a workout on an off day.${lockedDays && Object.keys(lockedDays).length > 0 ? '\n11. CRITICAL: Days marked as LOCKED in the context MUST appear in your plan with their EXACT type unchanged. Only optimize the remaining unlocked days.' : ''}`;

        const result = await generateCompletion({
            provider: 'anthropic',
            model: MODEL,
            prompt: context,
            system: systemPrompt,
            temperature: 0.3,
        });

        const text = typeof result === 'string' ? result : (result as any).text || '';

        let parsed: any = {};
        try {
            const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            parsed = { plan: {}, reasoning: text, gapAlert: null };
        }

        const plan = parsed.plan || {};
        const reasoning = parsed.reasoning || '';
        const gapAlert = parsed.gapAlert || null;

        // ── Store in Supabase ──
        const { error: upsertError } = await supabase
            .from('workout_weekly_plans')
            .upsert({
                user_id: SINGLE_USER_ID,
                week_start: weekStart,
                plan,
                reasoning,
                gap_alert: gapAlert,
                model: MODEL,
                created_at: new Date().toISOString(),
            }, { onConflict: 'user_id,week_start' });

        if (upsertError) {
            console.error('Weekly plan upsert error:', upsertError);
        }

        // Task creation is handled daily by the orchestrator's populate-daily-workout step

        // Log usage
        const tokensIn = Math.ceil(context.length / 4);
        const tokensOut = Math.ceil(text.length / 4);
        await logUsage({
            provider: 'anthropic',
            model: MODEL,
            tokensIn,
            tokensOut,
            feature: 'workout_weekly_planner',
            userId: 'anon',
        });

        return NextResponse.json({
            plan,
            reasoning,
            gapAlert,
            model: MODEL,
            weekStart,
        });

    } catch (error: any) {
        console.error('Weekly plan POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Save manual edits to the weekly plan
export async function PUT(req: Request) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { plan, notes } = await req.json();
        const weekStart = getWeekStart();

        // Merge plan + notes into the JSONB format: { "Mon": { type: "Push (Chest)", note: "..." }, ... }
        const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const merged: Record<string, { type: string; note: string }> = {};
        for (const day of DAY_ORDER) {
            merged[day] = {
                type: plan[day] || 'Rest',
                note: notes?.[day] || (plan[day] ? '' : 'Recovery day'),
            };
        }

        const { error } = await supabase
            .from('workout_weekly_plans')
            .upsert({
                user_id: SINGLE_USER_ID,
                week_start: weekStart,
                plan: merged,
            }, { onConflict: 'user_id,week_start' });

        if (error) throw error;

        return NextResponse.json({ success: true, weekStart });
    } catch (error: any) {
        console.error('Weekly plan PUT error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
