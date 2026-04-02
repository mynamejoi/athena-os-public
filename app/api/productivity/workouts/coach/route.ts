import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCompletion } from '@/lib/llm';
import { logUsage } from '@/lib/usage';
import { toETShortDate } from '@/lib/date-utils';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        let {
            type, // "pre" or "post"
            workoutType,
            recoveryScore,
            lastTypeStrain, // strain from last same-type workout
            template, // { exercise_name }[]
            recentHistory, // last 3 workouts of same type
            todayExercises, // post only — what was logged
            previousCoachNotes, // previous AI coach suggestions for this type
            progressiveOverload, // per-exercise PR, volume, plateau data
            siblingContext, // exercises from sibling focus (e.g., Pull (Bicep) when coaching Pull (Back))
            // New biometric data
            sleepHours,
            sleepPerformance,
            hrv,
            restingHr,
            priorDayStrain,
            priorDayWorkoutType,
            sleepDebt,
            skinTemp,
            respiratoryRate,
            todayStrain, // post-workout: today's accumulated strain
            // Trend data
            whoopTrends,
            daysSinceLast,
            weeklyAccumulatedStrain,
            weeklySessionCount,
            weekPlanNote,
            athleteNotes, // freeform notes from the athlete about how the workout went
            workoutDate, // date of the workout being analyzed (may be retroactive)
            fetchWhoopForDate, // true when client wants server to fetch WHOOP data for workoutDate
        } = body;

        if (!type || !workoutType) {
            return NextResponse.json({ error: 'Missing type or workoutType' }, { status: 400 });
        }

        const isPre = type === 'pre';

        // For retroactive reviews, fetch WHOOP data server-side (service role key)
        if (fetchWhoopForDate && workoutDate) {
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            const priorDay = new Date(workoutDate + 'T12:00:00');
            priorDay.setDate(priorDay.getDate() - 1);
            const priorDayStr = priorDay.toISOString().split('T')[0];
            const trendStart = new Date(workoutDate + 'T12:00:00');
            trendStart.setDate(trendStart.getDate() - 14);
            const trendStartStr = trendStart.toISOString().split('T')[0];

            const [wdRes, pdRes, trendRes] = await Promise.all([
                supabase.from('whoop_data').select('*').eq('date', workoutDate).maybeSingle(),
                supabase.from('whoop_data').select('*').eq('date', priorDayStr).maybeSingle(),
                supabase.from('whoop_data').select('date, recovery_score, hrv, resting_hr, strain')
                    .gte('date', trendStartStr).lte('date', workoutDate)
                    .order('date', { ascending: false }),
            ]);

            const wd = wdRes.data;
            const pd = pdRes.data;
            if (wd) {
                recoveryScore = wd.recovery_score;
                sleepHours = wd.sleep_hours;
                sleepPerformance = wd.sleep_performance;
                hrv = wd.hrv;
                restingHr = wd.resting_hr;
                sleepDebt = wd.sleep_debt_minutes;
                skinTemp = wd.skin_temp_celsius;
                respiratoryRate = wd.respiratory_rate;
                todayStrain = wd.strain;
            }
            if (pd) {
                priorDayStrain = pd.strain;
            }
            // Compute trends from 14-day window
            if (trendRes.data && trendRes.data.length >= 3) {
                const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
                const hrvVals = trendRes.data.filter((d: any) => d.hrv != null).map((d: any) => d.hrv);
                const recVals = trendRes.data.filter((d: any) => d.recovery_score != null).map((d: any) => d.recovery_score);
                const rhrVals = trendRes.data.filter((d: any) => d.resting_hr != null).map((d: any) => d.resting_hr);
                const trend = (recent: number | null, base: number | null) =>
                    recent != null && base != null ? (recent > base * 1.05 ? 'rising' : recent < base * 0.95 ? 'falling' : 'stable') : null;
                whoopTrends = {
                    hrv3Day: avg(hrvVals.slice(0, 3)), hrvBaseline: avg(hrvVals), hrvTrend: trend(avg(hrvVals.slice(0, 3)), avg(hrvVals)),
                    recovery3Day: avg(recVals.slice(0, 3)), recoveryBaseline: avg(recVals), recoveryTrend: trend(avg(recVals.slice(0, 3)), avg(recVals)),
                    restingHr3Day: avg(rhrVals.slice(0, 3)), restingHrBaseline: avg(rhrVals), restingHrTrend: trend(avg(rhrVals.slice(0, 3)), avg(rhrVals)),
                };
            }
        }

        // Build context
        const todayStr = toETShortDate(new Date());
        const isRetroactive = workoutDate && workoutDate !== todayStr;
        let context = `## Workout Type: ${workoutType}\n`;
        if (isRetroactive) {
            context += `## Workout Date: ${workoutDate} (retroactive review — all history is relative to this date, not today)\n`;
        }

        // ─── Biometrics Dashboard ───
        context += `\n## Biometrics Dashboard\n`;

        if (recoveryScore !== null && recoveryScore !== undefined) {
            const zone = recoveryScore >= 67 ? 'GREEN (high — ready to push)' : recoveryScore >= 34 ? 'YELLOW (moderate — maintain)' : 'RED (low — deload/recover)';
            context += `- Recovery: ${recoveryScore}% — ${zone}\n`;
        }

        if (sleepHours != null) {
            context += `- Sleep: ${sleepHours.toFixed(1)}h`;
            if (sleepPerformance != null) context += ` (${sleepPerformance}% performance)`;
            if (sleepDebt != null) context += ` | Debt: ${sleepDebt}min`;
            context += `\n`;
        }

        if (hrv != null) {
            context += `- HRV: ${hrv}ms`;
            if (restingHr != null) context += ` | Resting HR: ${restingHr}bpm`;
            context += `\n`;
        } else if (restingHr != null) {
            context += `- Resting HR: ${restingHr}bpm\n`;
        }

        if (respiratoryRate != null) context += `- Respiratory Rate: ${respiratoryRate.toFixed(1)}/min\n`;

        if (priorDayStrain != null) {
            context += `- Yesterday: ${priorDayWorkoutType || 'Activity'} — ${priorDayStrain.toFixed(1)} strain\n`;
        }

        if (lastTypeStrain !== null && lastTypeStrain !== undefined) {
            context += `- Last ${workoutType} Strain: ${lastTypeStrain}/21\n`;
        }

        if (!isPre && todayStrain != null) {
            context += `- Today's Session Strain: ${todayStrain.toFixed(1)}\n`;
        }

        // ─── Trend Data ───
        if (whoopTrends) {
            context += `\n## Biometric Trends (14-day baseline → 3-day recent)\n`;
            if (whoopTrends.hrvBaseline != null && whoopTrends.hrv3Day != null) {
                const arrow = whoopTrends.hrvTrend === 'rising' ? '↑' : whoopTrends.hrvTrend === 'falling' ? '↓' : '→';
                context += `- HRV: ${whoopTrends.hrv3Day.toFixed(0)}ms (3-day) vs ${whoopTrends.hrvBaseline.toFixed(0)}ms (14-day baseline) ${arrow} ${whoopTrends.hrvTrend || 'unknown'}\n`;
            }
            if (whoopTrends.recoveryBaseline != null && whoopTrends.recovery3Day != null) {
                const arrow = whoopTrends.recoveryTrend === 'rising' ? '↑' : whoopTrends.recoveryTrend === 'falling' ? '↓' : '→';
                context += `- Recovery: ${whoopTrends.recovery3Day.toFixed(0)}% (3-day) vs ${whoopTrends.recoveryBaseline.toFixed(0)}% (14-day baseline) ${arrow} ${whoopTrends.recoveryTrend || 'unknown'}\n`;
            }
            if (whoopTrends.restingHrBaseline != null && whoopTrends.restingHr3Day != null) {
                const arrow = whoopTrends.restingHrTrend === 'rising' ? '↑' : whoopTrends.restingHrTrend === 'falling' ? '↓' : '→';
                context += `- Resting HR: ${whoopTrends.restingHr3Day.toFixed(0)}bpm (3-day) vs ${whoopTrends.restingHrBaseline.toFixed(0)}bpm (14-day baseline) ${arrow} ${whoopTrends.restingHrTrend || 'unknown'}\n`;
            }
        }

        // ─── Weekly Load & Frequency ───
        context += `\n## Weekly Training Load\n`;
        if (weeklySessionCount != null) context += `- Sessions this week: ${weeklySessionCount}\n`;
        if (weeklyAccumulatedStrain != null) context += `- Accumulated strain this week: ${weeklyAccumulatedStrain.toFixed(1)}\n`;
        if (daysSinceLast != null) context += `- Days since last ${workoutType}: ${daysSinceLast}\n`;
        else context += `- Days since last ${workoutType}: N/A (first session)\n`;

        // ─── Weekly Plan Note ───
        if (weekPlanNote) {
            context += `\n## Weekly Plan Note for Today\n${weekPlanNote}\n`;
            context += `(This is the athlete's own note from their weekly planner. Align your coaching with this intent.)\n`;
        }

        if (template && template.length > 0) {
            context += `\n## Preset Template Exercises (current order, top = first exercise, bottom = last):\n${template.map((e: any, i: number) => `${i + 1}. ${e.exercise_name}`).join('\n')}\n`;
        }

        if (recentHistory && recentHistory.length > 0) {
            context += `\n## Recent Workouts (same type, most recent first — per-set detail for fatigue comparison):\n`;
            recentHistory.forEach((w: any, i: number) => {
                context += `\n### ${w.date}${w.strain ? ` (strain: ${w.strain.toFixed(1)})` : ''}\n`;
                (w.exercises || []).forEach((ex: any) => {
                    context += `- **${ex.exercise_name}**:\n`;
                    (ex.set_entries || []).forEach((s: any, setIdx: number) => {
                        const setCount = s.sets && s.sets > 1 ? s.sets : 1;
                        context += `  Set ${setIdx + 1}: ${setCount > 1 ? setCount + '×' : ''}${s.reps || '?'} reps @ ${s.weight || '?'} lbs\n`;
                    });
                });
            });
        }

        if (!isPre && todayExercises && todayExercises.length > 0) {
            context += `\n## ${isRetroactive ? workoutDate : 'Today\'s'} Logged Exercises (in order performed, top = first):\n`;
            todayExercises.forEach((ex: any) => {
                context += `- **${ex.exercise_name}**:\n`;
                (ex.set_entries || []).forEach((s: any, setIdx: number) => {
                    const setCount = s.sets && s.sets > 1 ? s.sets : 1;
                    context += `  Set ${setIdx + 1}: ${setCount > 1 ? setCount + '×' : ''}${s.reps || '?'} reps @ ${s.weight || '?'} lbs${s.isDropSet ? ' (drop set)' : ''}\n`;
                });
            });
        }

        // Add athlete's own notes about the workout
        if (athleteNotes) {
            context += `\n## Athlete's Notes:\n${athleteNotes}\n`;
            context += `(These are the athlete's own words about how the workout felt. Reference and respond to these in your analysis.)\n`;
        }

        // Add previous coach notes for memory
        if (previousCoachNotes && previousCoachNotes.length > 0) {
            context += `\n## Your Previous Coaching Notes for ${workoutType} (most recent first):\n`;
            previousCoachNotes.forEach((note: any) => {
                const dateStr = note.created_at ? toETShortDate(new Date(note.created_at)) : 'recent';
                context += `\n### ${note.coach_type === 'pre' ? 'Pre' : 'Post'}-Workout (${dateStr}):\n`;
                (note.notes || []).forEach((n: string) => { context += `- ${n}\n`; });
                if (note.exercise_suggestions?.length > 0) {
                    context += `- Suggested exercises: ${note.exercise_suggestions.join(', ')}\n`;
                }
                if (note.weight_notes && Object.keys(note.weight_notes).length > 0) {
                    Object.entries(note.weight_notes).forEach(([ex, wt]) => {
                        context += `- ${ex}: ${wt}\n`;
                    });
                }
            });
        }

        // Add progressive overload data
        if (progressiveOverload && Object.keys(progressiveOverload).length > 0) {
            context += `\n## Progressive Overload Analysis:\n`;
            context += `(sessions = total times this exercise has been logged. [1 session] = FIRST TIME — no comparison data exists, treat as baseline.)\n`;
            Object.entries(progressiveOverload).forEach(([exercise, data]: [string, any]) => {
                const flags: string[] = [];
                if (data.sessions === 1) flags.push('FIRST TIME — baseline only');
                else {
                    if (data.isPR) flags.push('WEIGHT PR!');
                    if (data.isVolumePR) flags.push('VOLUME PR!');
                    if (data.plateau) flags.push('PLATEAU (same weight 3+ sessions)');
                }
                const volTrend = data.volumes && data.volumes.length >= 2 ? (data.volumeTrend > 0 ? `+${data.volumeTrend}` : data.volumeTrend < 0 ? `${data.volumeTrend}` : '=') : 'N/A';
                context += `- ${exercise}: max ${data.prWeight}lbs, current ${data.currentWeight}lbs, vol ${data.currentVolume}lbs (${volTrend} vs last) [${data.sessions} session${data.sessions > 1 ? 's' : ''}]${flags.length ? ' ' + flags.join(' ') : ''}\n`;
            });
        }

        // Add sibling workout context
        if (siblingContext && siblingContext.exercises?.length > 0) {
            context += `\n## Sibling Focus — ${siblingContext.type} (most recent):\n`;
            context += `Exercises done in ${siblingContext.type}: ${siblingContext.exercises.join(', ')}\n`;
            context += `Note: Avoid suggesting exercises already covered in ${siblingContext.type}. Suggest exercises that complement, not duplicate.\n`;
        }

        // ─── System Prompts ───

        const systemPrompt = isPre
            ? buildPreWorkoutPrompt(workoutType, recoveryScore, hrv, sleepHours, priorDayStrain, priorDayWorkoutType)
            : buildPostWorkoutPrompt(workoutType);

        const result = await generateCompletion({
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            prompt: context,
            system: systemPrompt,
            temperature: 0.2,
        });

        const text = typeof result === 'string' ? result : (result as any).text || '';

        // Parse JSON response
        let parsed: any = {};
        try {
            const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(cleaned);
        } catch {
            parsed = { notes: [text], exerciseSuggestions: [], weightNotes: {} };
        }

        // Map semantic JSON keys back into a clean array for the frontend UI
        let finalNotes: string[] = [];
        if (parsed.notes) {
            // Fallback: LLM returned old format
            finalNotes = parsed.notes;
        } else if (isPre) {
            finalNotes = [
                parsed.recoveryAssessment,
                parsed.sessionStrategy,
            ].flat().filter(Boolean);
        } else {
            finalNotes = [
                parsed.progressHighlights,
                parsed.performanceReview,
                parsed.complianceCheck,
                parsed.fatigueAnalysis,
                parsed.recoveryRecommendation,
            ].flat().filter(Boolean);
        }

        // Determine intensity
        let intensity: 'push' | 'maintain' | 'deload' = 'maintain';
        if (recoveryScore !== null && recoveryScore !== undefined) {
            if (recoveryScore >= 67) intensity = 'push';
            else if (recoveryScore < 34) intensity = 'deload';
        }

        // Log usage
        const tokensIn = Math.ceil(context.length / 4);
        const tokensOut = Math.ceil(text.length / 4);
        await logUsage({
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            tokensIn,
            tokensOut,
            feature: 'workout_coach',
            userId: 'anon',
        });

        return NextResponse.json({
            notes: finalNotes,
            exerciseSuggestions: parsed.exerciseSuggestions || [],
            weightNotes: parsed.exerciseTargets || parsed.weightNotes || {},
            warmUp: parsed.warmUp || {},
            exerciseOrder: parsed.exerciseOrder || [],
            nextSessionTargets: parsed.nextSessionTargets || {},
            warnings: parsed.warnings || [],
            intensity,
            type,
        });

    } catch (error: any) {
        console.error('Coach API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


// ─── Pre-Workout System Prompt ───
function buildPreWorkoutPrompt(
    workoutType: string,
    recoveryScore?: number | null,
    hrv?: number | null,
    sleepHours?: number | null,
    priorDayStrain?: number | null,
    priorDayWorkoutType?: string | null,
) {
    const recoveryZone = recoveryScore != null
        ? recoveryScore >= 67 ? 'GREEN' : recoveryScore >= 34 ? 'YELLOW' : 'RED'
        : 'UNKNOWN';

    return `You are Coach — an elite, data-driven sports scientist and strength coach who has trained this athlete for months. You know their exercise history, PRs, plateaus, biometrics, and previous coaching notes intimately.

Today's workout: ${workoutType}. Recovery zone: ${recoveryZone}.

ANALYZE the provided biometrics and workout history, then respond with ONLY valid JSON (no markdown, no code fences):

{
  "recoveryAssessment": "1 sentence. Key numbers only: recovery %, HRV vs baseline, sleep. End with readiness verdict.",
  "sessionStrategy": ["Bench Press: pushing to 145 — matched PR last session, 6-day rest allows full recovery", "Pec Deck: hold at 115, focus on squeeze tempo", "Seated Cable Row: adding as row variation — estimating 140 lbs based on Machine Row at 170", "Deadlift: adding for compound pull — estimating 185 lbs based on row strength at 170 + 15 lbs"],
  "exerciseTargets": {"Exercise Name": "2x10 @ 135, 1x8 @ 145 lbs", "Seated Cable Row": "3x10 @ 140 lbs", "Deadlift": "3x5 @ 185 lbs"},
  "warmUp": {"Exercise Name": "2x8 @ 95 lbs"},
  "exerciseSuggestions": ["New Exercise (swap for Old Exercise)"],
  "exerciseOrder": ["Exercise 1", "Exercise 2"],
  "warnings": ["Short red flag if any. Empty array if none."]
}

CRITICAL COACHING RULES:

1. BE SPECIFIC — Never say "maintain current weight" generically. In sessionStrategy, say "Bench Press: pushing from 185 to 190 — been at 185 for 3 sessions." In exerciseTargets, just put the numbers: "2x10 @ 185, 1x8 @ 190".

2. MEMORY — You have previous coaching notes above. Reference what you suggested last time. Did they follow your advice? Build on it. If you said "push to 190 lbs next session" last time, acknowledge that plan today.

3. PLAN RECONCILIATION — Check your previous coaching notes. If you or a post-session review suggested a target weight:
   - ${recoveryZone === 'GREEN' ? 'GREEN recovery — confirm and push that target. Go for PRs if the data supports it.' : recoveryZone === 'YELLOW' ? 'YELLOW recovery — this is a NORMAL training day. Proceed with planned targets. Only dial back if recovery is below 40% AND HRV is trending down. At 50%+ recovery, train as planned — do not suggest rest days or walks.' : recoveryZone === 'RED' ? 'RED recovery (below 34%) — reduce intensity. Maintain the workout type but lower weights 10-15%. Only suggest skipping the session entirely if recovery is below 20% or the athlete reports injury/illness.' : 'No biometric data available. Default to MAINTAIN intensity and proceed with planned targets. Use exercise history, previous session performance, and days since last workout to guide adjustments. Do not reference recovery zones, HRV, or sleep quality in your response.'}

4. PROGRESSIVE OVERLOAD:
   - PLATEAU flagged? Suggest a concrete strategy: drop sets, tempo changes, rep range shift, brief deload.
   - GREEN recovery + no plateau? Target specific weight increases with exact numbers.
   - Track VOLUME trends — increasing volume is progress even if weight stays constant.

5. EXERCISE BALANCE:
   - exerciseSuggestions: Suggest 0-2 swaps formatted as "New Exercise (swap for Old Exercise)". Only if genuinely beneficial.
   - CRITICAL: For EVERY exercise in exerciseSuggestions (not just some — ALL of them), you MUST add entries in BOTH exerciseTargets AND sessionStrategy. This is non-negotiable:
     a) exerciseTargets: "3x10 @ 135 lbs" — estimate weight by cross-referencing similar movement patterns in the athlete's history (e.g., if they row 170 lbs on Machine Row, estimate Seated Cable Row at ~140-150 lbs; if they deadlift, estimate from row weights + ~30-50%). NEVER leave a suggested exercise without a weight target.
     b) sessionStrategy: MUST include a line for EACH suggested exercise explaining the weight reasoning, e.g., "Seated Cable Row: adding as compound row variation — estimating 140 lbs based on Machine Row history at 170". If you suggest 2 exercises, there must be 2 corresponding sessionStrategy entries.
   - Don't stack 3+ isolation exercises for the same muscle head.
   - If sibling workout context is provided, don't duplicate those movements.

6. EXERCISE ORDER ("exerciseOrder"): Return ALL exercises (after applying any swaps) in optimal order:
   - Compounds before isolations
   - NEVER place 2+ exercises targeting the same muscle back-to-back
   - Most neurologically demanding first
   - Finish with least fatiguing isolation work

7. exerciseTargets: Include WORKING SETS target for EVERY exercise in the template. NUMBERS ONLY — no reasoning (that goes in sessionStrategy). Format options:
   - Uniform: "3x10 @ 145 lbs"
   - Ramping: "2x10 @ 135, 1x8 @ 145 lbs"
   - Drop set: "1x10 @ 145, 1x10 @ 135, 1x12 @ 115 lbs"
   - Deload: "3x12 @ 115 lbs"
   Choose the set scheme that best fits the athlete's goal for that exercise. Don't default to 3x10 for everything — vary based on whether you're pushing (ramp up last set), holding (uniform), or deloading (lighter, higher reps).

8. warmUp: Include warm-up sets ONLY for the first 1-2 compound exercises (bench, squat, row, OHP, deadlift). Skip warm-ups for isolation/machine exercises. Format: "2x8 @ 95 lbs" or "1x10 @ 65, 1x8 @ 95 lbs". Warm-up weights should be 50-70% of working weight. If the athlete has been resting 5+ days, add an extra light warm-up set.

9. TREND ANALYSIS — You have 14-day baseline vs 3-day recent data for HRV, recovery, and resting HR. Use these to detect overtraining signals:
   - HRV falling below baseline + rising resting HR = overtraining. Recommend deload.
   - HRV rising above baseline + stable resting HR = supercompensation. Push harder.
   - Resting HR trending up > 5% above baseline = accumulated fatigue. Reduce volume.
   Reference the EXACT trend numbers in your recoveryAssessment.

10. WEEKLY LOAD — This athlete targets 5 sessions per week. Do NOT suggest skipping a planned session unless there are clear overtraining signals (HRV falling + RHR rising + recovery below 30%). Having 3-4 sessions already completed this week is NORMAL and expected — do not treat it as a reason to reduce volume.

11. REST INTERVAL — Check days since last ${workoutType}. Adjust recommendations:
   - 1-3 days: Normal rest for a different muscle group. Proceed as planned.
   - 4-5 days: Well rested. Good conditions to push for progression.
   - 7+ days: Fully recovered. Add an extra warm-up set to prime, then train at full intensity — longer rest means MORE capacity, not less.
   - 1 day, SAME muscle group: Short recovery. Reduce volume by 20% but still train.
   IMPORTANT: When reporting rest interval, ALWAYS mention yesterday's workout if one occurred (e.g., "7 days since last Push (Chest), but trained Pull (Back) yesterday at 14.2 strain"). This gives the athlete context that the rest period is muscle-group-specific, not total inactivity.

12. CONTEXTUAL ADJUSTMENTS:
   - Prior-day fatigue: ${priorDayStrain != null ? `Yesterday was ${priorDayWorkoutType || 'Activity'} at ${priorDayStrain.toFixed(1)} strain. Mention this in your recoveryAssessment to give context alongside the days-since-last-${workoutType} rest interval.` : 'No workout yesterday — true rest day.'}
   - Sleep deficit: ${sleepHours != null && sleepHours < 6 ? `Only ${sleepHours.toFixed(1)}h sleep last night. Adjust intensity expectations and note this in recoveryAssessment.` : 'N/A — sleep was adequate.'}`;

}


// ─── Post-Workout System Prompt ───
function buildPostWorkoutPrompt(workoutType: string) {
    return `You are Coach — an elite, data-driven sports scientist reviewing a completed ${workoutType} workout. You have trained this athlete for months and know their full history.

You have the athlete's logged exercises with exact weights/reps, recent workout history, biometrics dashboard, your previous Pre-Workout coaching notes, and any notes the athlete wrote about how the session felt.

IMPORTANT: The exercises in "Today's Logged Exercises" are listed in the order they were performed — first exercise at top, last at bottom. Use this to evaluate fatigue management and exercise sequencing.

Respond with ONLY valid JSON (no markdown, no code fences):

{
  "progressHighlights": "LEAD WITH THIS. 1-3 sentences. PRs with exact numbers and context ('New Bench PR at 185 lbs — up 10 lbs from Mar 28'). Weight increases even without PR flags. Volume records. This is the most important field — celebrate wins first.",
  "performanceReview": "1-2 sentences. Overall session verdict referencing key exercises and weights.",
  "complianceCheck": "1 sentence. Did they hit your pre-workout targets? Reference specific numbers.",
  "fatigueAnalysis": "1-2 sentences. ONLY flag fatigue when reps drop at the SAME weight across sets. If weight increased and reps dropped, that is EXPECTED strength progression, not fatigue.",
  "nextSessionTargets": {"Exercise Name": "2x10 @ 140, 1x8 @ 150 lbs"},
  "recoveryRecommendation": "1 sentence. Based on strain and biometric trends.",
  "exerciseSuggestions": [],
  "weightNotes": {}
}

CRITICAL COACHING RULES:

0. FIRST-TIME EXERCISES — In the Progressive Overload Analysis, any exercise marked [1 session] FIRST TIME is being logged for the VERY FIRST TIME. For these exercises:
   - Do NOT compare to previous sessions (there are none).
   - Do NOT call them PRs or false positives.
   - DO establish this as the baseline: "First time logging Skull Crushers at 35 lbs — solid starting point. Next session, aim for 3x12 to confirm the weight before progressing."
   - Focus on form cues and realistic next-session targets rather than progression analysis.

1. ACCOUNTABILITY — Cross-reference what was logged against your Pre-Workout notes. Did they hit the targets you set? Acknowledge compliance positively. Note deviations neutrally (not judgmentally). If the athlete wrote notes about how the session felt, acknowledge and respond to their feedback.

2. PROGRESSIVE OVERLOAD — This is the PRIMARY lens for post-workout analysis. Lead with what went RIGHT:
   - ANY weight increase vs last session is progress, even if reps are lower. "Bench jumped from 135 to 185 lbs — 37% weight increase. Rep drop from 10 to 8 is expected when pushing heavier."
   - Celebrate PRs with exact numbers and context: "New PR on Bench at 195 lbs — up 10 lbs from your best on Feb 28."
   - Check the Progressive Overload Analysis data for WEIGHT PR and VOLUME PR flags — these MUST be highlighted prominently in progressHighlights.
   - If PLATEAU flagged, define a concrete next-session strategy: "Bench stalled at 185 for 3 sessions. Next time: 4x6 at 190, accept lower reps to break through."
   - Reference volume trends — is total volume increasing, plateauing, or declining?
   - For exercises with only 2 sessions of data, keep comparisons simple — you only have one prior data point.

3. NEXT SESSION TARGETS — NUMBERS ONLY, no reasoning (that belongs in the other fields). Format options:
   - Uniform: "3x10 @ 145 lbs"
   - Ramping: "2x10 @ 135, 1x8 @ 145 lbs"
   - Drop set: "1x10 @ 145, 1x10 @ 135, 1x12 @ 115 lbs"
   - Deload: "3x12 @ 115 lbs"
   Choose the set scheme that best fits the athlete's progression for that exercise. These targets will be auto-populated into the next session's exercise entries by the pre-workout coach, so they must be precise. Include targets for EVERY exercise that was logged. Base targets on what the athlete SHOULD hit next session given their current trajectory — not on an assumed recovery zone. If the data supports a push, push. If they're plateaued or fatigued, hold. The pre-workout coach will make final adjustments based on that day's recovery, but your targets should be realistic starting points, not aspirational green-day maximums.

4. EXERCISE SEQUENCING — Comment on whether their exercise order was optimal. Did they frontload compounds? Was there fatigue stacking? If they reordered exercises from the prescribed order, note whether the change was beneficial or detrimental.

5. VOLUME ANALYSIS — Compare today's total volume to recent sessions. Note the trend.

6. STRAIN CORRELATION — If session strain data is available, comment on whether it matched the effort logged (high weights + high strain = good signal; high weights + low strain = possible form issues or short rest).

7. FATIGUE vs PROGRESSION — Do NOT confuse these:
   - REAL FATIGUE: reps drop at the SAME weight across sets (e.g., Set 1: 10r@185, Set 2: 8r@185 = 20% rep drop). This is normal intra-set fatigue.
   - NOT FATIGUE: fewer reps at a HIGHER weight vs last session (e.g., last session 10r@135, today 8r@185 = strength progression, not a "rep drop"). NEVER frame weight increases as fatigue or regression.
   - Intentional light sets (e.g., 2x20 @ 10 lbs after heavy work) are burnout/pump sets — not regression. Don't flag them as "80% weight drops."
   - Mild intra-set fatigue (10-15% rep drop at same weight) is NORMAL and healthy. Only flag fatigue concerns when it's severe (30%+) AND at the same weight.
   - For single-set exercises, fatigue cannot be measured. Note weight relative to history instead.
   - Compare fatigue patterns to previous sessions only when meaningful (same weight range).

8. CROSS-SESSION COMPARISON — Compare today's performance to previous sessions of the same type:
   - WEIGHT INCREASES are the primary signal. If the athlete lifted heavier, that's the headline — don't bury it under fatigue analysis.
   - Only compare rep fatigue across sessions when weights are similar. Comparing reps at 185 lbs to reps at 135 lbs is meaningless.
   - If fatigue patterns at the same weight are improving, note it as adaptation: "Bench held 10 reps at 135 across all sets vs 10→8 drop last session."

9. WEEKLY LOAD CONTEXT — Check the Weekly Training Load section. If accumulated strain is high (>40) or session count is 4+, factor this into recoveryRecommendation and nextSessionTargets. Suggest reduced volume or an extra rest day if the week has been demanding.

10. BIOMETRIC TREND AWARENESS — Check the Biometric Trends section. If HRV is falling below baseline or resting HR is rising, mention this in recoveryRecommendation. These are leading indicators of overtraining that should inform your next session recommendations.

11. ATHLETE FEEDBACK — If the athlete provided notes about the workout, treat this as critical input. They may report joint pain, soreness, feeling weak/strong, equipment issues, or form feedback. Respond to their specific concerns in performanceReview or recoveryRecommendation. If they mention pain or discomfort, prioritize this in nextSessionTargets (reduce weight, suggest alternatives).

12. WEEKLY PLAN ALIGNMENT — If a Weekly Plan Note exists, check whether the completed workout aligned with the planner's intent. If the plan said "squat focus" but the athlete skipped squats, note this. If they nailed the plan's intent, acknowledge it.

13. EXERCISE SUGGESTIONS — If you suggest exercise swaps in exerciseSuggestions, format as "New Exercise (swap for Old Exercise)". For EACH suggestion, you MUST include a corresponding entry in nextSessionTargets with specific sets/reps/weight. Keep suggestions to 0-2 max.`;
}
