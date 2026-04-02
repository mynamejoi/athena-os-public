import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';
import { toETDateString, getETHour, getETMinute, getETDayOfWeek, getETDayName, getETYesterday, formatDateStr } from '@/lib/date-utils';
import { getAppConfigJSON } from '@/lib/app-config';

function getBaseUrl() {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'http://localhost:3000';
}

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase credentials');
    return createClient(url, key);
}

interface StepResult {
    name: string;
    success: boolean;
    skipped?: boolean;
    reason?: string;
    error?: string;
    durationMs?: number;
}

// Vercel cron sends GET requests
export async function GET() {
    return POST(new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
    }));
}

export async function POST(req: Request) {
    const startTime = Date.now();
    console.log('[Orchestrator] Starting AI orchestration...');

    try {
        const body = await req.json().catch(() => ({}));
        const { dryRun = false, preview = false } = body;
        const whoopTriggered = body.whoopTriggered || false;
        const simulateNoWhoop = body.simulateNoWhoop || preview;

        const supabase = getSupabase();
        const baseUrl = getBaseUrl();

        // ── Date computation (UTC offset math, no toLocaleString) ──
        const now = new Date();
        const todayLocalStr = toETDateString(now);
        const dayOfWeek = getETDayName(now);
        const yesterdayStr = getETYesterday(now);
        const dayNum = getETDayOfWeek(now); // 0=Sun

        // Week start (Sunday)
        const todayDate = new Date(todayLocalStr + 'T12:00:00');
        const weekStartDate = new Date(todayDate);
        weekStartDate.setDate(weekStartDate.getDate() - dayNum);
        const weekStartStr = formatDateStr(weekStartDate);

        // Previous week range (Sun-Sat)
        const prevSundayDate = new Date(weekStartDate);
        prevSundayDate.setDate(prevSundayDate.getDate() - 7);
        const prevSundayStr = formatDateStr(prevSundayDate);
        const prevSaturdayDate = new Date(weekStartDate);
        prevSaturdayDate.setDate(prevSaturdayDate.getDate() - 1);
        const prevSaturdayStr = formatDateStr(prevSaturdayDate);

        // Month range
        const firstOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
        const lastMonthEnd = new Date(firstOfMonth);
        lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);
        const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
        const lastMonthStartStr = formatDateStr(lastMonthStart);
        const lastMonthEndStr = formatDateStr(lastMonthEnd);

        const isSunday = dayNum === 0;
        const isFirstOfMonth = todayDate.getDate() === 1;

        const currentHourET = getETHour(now);
        const currentMinuteET = getETMinute(now);
        console.log(`[Orchestrator] Time: ${currentHourET}:${String(currentMinuteET).padStart(2,'0')} ET (UTC ${now.getUTCHours()}:${String(now.getUTCMinutes()).padStart(2,'0')}), today=${todayLocalStr}, yesterday=${yesterdayStr}, whoopTriggered=${whoopTriggered}`);

        // ── Trigger time gate ──
        const triggerTimes = await getAppConfigJSON<Record<string, string>>('REPORT_TRIGGER_TIMES');

        function isBeforeTriggerTime(stepName: string): { blocked: boolean; reason: string } {
            if (!triggerTimes || !(stepName in triggerTimes)) {
                return { blocked: false, reason: 'No trigger time configured' };
            }
            const timeStr = triggerTimes[stepName];
            const match = timeStr.match(/^(\d{2}):(\d{2})$/);
            if (!match) return { blocked: false, reason: 'Invalid trigger time format' };
            const triggerHour = parseInt(match[1], 10);
            const triggerMinute = parseInt(match[2], 10);
            const currentTotal = currentHourET * 60 + currentMinuteET;
            const triggerTotal = triggerHour * 60 + triggerMinute;
            if (currentTotal < triggerTotal) {
                return { blocked: true, reason: `Before trigger time (${timeStr} ET)` };
            }
            return { blocked: false, reason: 'Past trigger time' };
        }

        // ── Data availability check ──
        // Gate on recovery_score (not sleep_hours): recovery is computed after sleep ends,
        // so it's null at midnight and only appears after the morning WHOOP sync.
        let hasWhoopData = false;
        let whoopConnected = false;
        if (!simulateNoWhoop) {
            const [{ data: whoopToday }, { data: whoopYesterday }] = await Promise.all([
                supabase
                    .from('whoop_data')
                    .select('recovery_score')
                    .eq('user_id', SINGLE_USER_ID)
                    .eq('date', todayLocalStr)
                    .not('recovery_score', 'is', null)
                    .maybeSingle(),
                supabase
                    .from('whoop_data')
                    .select('id')
                    .eq('user_id', SINGLE_USER_ID)
                    .eq('date', yesterdayStr)
                    .maybeSingle(),
            ]);
            hasWhoopData = !!whoopToday;
            whoopConnected = !!whoopYesterday;
        }

        const { count: habitCount } = await supabase
            .from('daily_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('date', yesterdayStr);
        const hasHabitData = (habitCount || 0) > 0;

        const { data: journalData } = await supabase
            .from('daily_summaries')
            .select('id')
            .eq('date', yesterdayStr)
            .not('journal_entry', 'is', null)
            .maybeSingle();
        const hasJournalData = !!journalData;

        const userWasActive = hasWhoopData || hasHabitData || hasJournalData;

        // ── Guard queries (parallel) ──
        // Preview and real reports live in separate namespaces via is_preview flag
        const isPreviewFilter = preview ? true : false;
        const [
            { data: existingDailyReport },
            { data: existingWeeklyReport },
            { data: existingMonthlyReport },
            { data: existingWeeklyPlan },
            { data: existingHabitInsights },
            { data: currentWeekPlan },
        ] = await Promise.all([
            // Daily report for yesterday (exclude failed so it can retry)
            supabase.from('ai_reports')
                .select('id')
                .eq('user_id', SINGLE_USER_ID)
                .eq('cadence', 'daily')
                .eq('period_start', yesterdayStr)
                .eq('is_preview', isPreviewFilter)
                .neq('status', 'failed')
                .maybeSingle(),
            // Weekly report for previous Sunday (exclude failed so it can retry)
            supabase.from('ai_reports')
                .select('id')
                .eq('user_id', SINGLE_USER_ID)
                .eq('cadence', 'weekly')
                .eq('period_start', prevSundayStr)
                .eq('is_preview', isPreviewFilter)
                .neq('status', 'failed')
                .maybeSingle(),
            // Monthly report for last month (exclude failed so it can retry)
            supabase.from('ai_reports')
                .select('id')
                .eq('user_id', SINGLE_USER_ID)
                .eq('cadence', 'monthly')
                .eq('period_start', lastMonthStartStr)
                .eq('is_preview', isPreviewFilter)
                .neq('status', 'failed')
                .maybeSingle(),
            // Weekly plan for current week
            supabase.from('workout_weekly_plans')
                .select('id')
                .eq('user_id', SINGLE_USER_ID)
                .eq('week_start', weekStartStr)
                .maybeSingle(),
            // Habit insights — check staleness (>7 days)
            supabase.from('ai_reports')
                .select('id, created_at')
                .eq('user_id', SINGLE_USER_ID)
                .eq('cadence', 'habit-insights')
                .eq('is_preview', isPreviewFilter)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            // Current week plan (to find today's workout type for coach notes)
            supabase.from('workout_weekly_plans')
                .select('plan')
                .eq('user_id', SINGLE_USER_ID)
                .eq('week_start', weekStartStr)
                .maybeSingle(),
        ]);

        // Determine today's planned workout type from weekly plan
        const dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayNum];
        let todayPlanEntry = currentWeekPlan?.plan?.[dayAbbrev];
        let todayWorkoutType = todayPlanEntry?.type || todayPlanEntry || null;
        let isRestDay = !todayWorkoutType || todayWorkoutType === 'Rest';

        // Check existing coach notes for today
        let existingCoachNotes = false;
        if (!isRestDay) {
            const todayStart = todayLocalStr + 'T00:00:00';
            const todayEnd = todayLocalStr + 'T23:59:59';
            const { data: coachData } = await supabase
                .from('coach_notes')
                .select('id')
                .eq('workout_type', todayWorkoutType)
                .eq('coach_type', 'pre')
                .eq('is_preview', isPreviewFilter)
                .gte('created_at', todayStart)
                .lt('created_at', todayEnd)
                .limit(1);
            existingCoachNotes = (coachData?.length ?? 0) > 0;
        }

        // Habit insights staleness check
        const habitInsightsStale = (() => {
            if (!existingHabitInsights?.created_at) return true;
            const lastGenerated = new Date(existingHabitInsights.created_at);
            const daysSince = (now.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60 * 24);
            return daysSince > 7;
        })();

        // ── WHOOP data gate ──
        // Simple: does today have recovery data yet? No → wait. Yes → generate.
        // Non-WHOOP users bypass this entirely (no WHOOP data to wait for).
        const whoopMorningReady = !whoopConnected || hasWhoopData;
        const whoopWaitReason = (whoopConnected && !hasWhoopData)
            ? 'Waiting for today\'s WHOOP sleep/recovery data'
            : 'Ready';
        console.log(`[Orchestrator] Gate: whoopConnected=${whoopConnected}, hasWhoopData=${hasWhoopData}, ready=${whoopMorningReady}`);

        // ── Step decisions ──
        const coachTimeGate = isBeforeTriggerTime('pre-coach-notes');
        const dailyTimeGate = isBeforeTriggerTime('daily-report');
        const weeklyTimeGate = isBeforeTriggerTime('weekly-report');
        const monthlyTimeGate = isBeforeTriggerTime('monthly-report');

        const steps: { name: string; trigger: boolean; reason: string }[] = [
            {
                name: 'weekly-plan',
                trigger: isSunday && !existingWeeklyPlan && userWasActive,
                reason: !isSunday ? 'Not Sunday' : existingWeeklyPlan ? 'Already exists' : !userWasActive ? 'No user activity' : 'Ready',
            },
            {
                name: 'populate-daily-workout',
                // NOT gated by trigger time or WHOOP — tasks should exist when the user opens the app
                trigger: !isRestDay && !!currentWeekPlan,
                reason: isRestDay ? 'Rest day or no plan' : !currentWeekPlan ? 'No weekly plan' : 'Ready',
            },
            {
                name: 'pre-coach-notes',
                trigger: !coachTimeGate.blocked && !isRestDay && !existingCoachNotes && userWasActive && whoopMorningReady,
                reason: coachTimeGate.blocked ? coachTimeGate.reason : isRestDay ? 'Rest day or no plan' : existingCoachNotes ? 'Already exists today' : !userWasActive ? 'No user activity' : whoopWaitReason,
            },
            {
                name: 'daily-report',
                trigger: !dailyTimeGate.blocked && !existingDailyReport && userWasActive && whoopMorningReady,
                reason: dailyTimeGate.blocked ? dailyTimeGate.reason : existingDailyReport ? 'Already exists' : !userWasActive ? 'No user activity' : whoopWaitReason,
            },
            {
                name: 'weekly-report',
                trigger: !weeklyTimeGate.blocked && isSunday && !existingWeeklyReport && userWasActive && whoopMorningReady,
                reason: weeklyTimeGate.blocked ? weeklyTimeGate.reason : !isSunday ? 'Not Sunday' : existingWeeklyReport ? 'Already exists' : !userWasActive ? 'No user activity' : whoopWaitReason,
            },
            {
                name: 'monthly-report',
                trigger: !monthlyTimeGate.blocked && (isFirstOfMonth || (todayDate.getDate() <= 3 && !existingMonthlyReport)) && !existingMonthlyReport && userWasActive && whoopMorningReady,
                reason: monthlyTimeGate.blocked ? monthlyTimeGate.reason : (!isFirstOfMonth && todayDate.getDate() > 3) ? 'Past day 3 of month' : existingMonthlyReport ? 'Already exists' : !userWasActive ? 'No user activity' : whoopWaitReason,
            },
            {
                name: 'habit-insights',
                trigger: (isSunday || isFirstOfMonth) && habitInsightsStale && userWasActive,
                reason: !(isSunday || isFirstOfMonth) ? 'Not Sunday or 1st' : !habitInsightsStale ? 'Still fresh (<7 days)' : !userWasActive ? 'No user activity' : 'Ready',
            },
        ];

        // ── Dry run mode ──
        if (dryRun) {
            const wouldGenerate: Record<string, { trigger: boolean; reason: string }> = {};
            for (const s of steps) {
                wouldGenerate[s.name] = { trigger: s.trigger, reason: s.reason };
            }

            return NextResponse.json({
                timestamp: now.toISOString(),
                dayOfWeek,
                todayLocalStr,
                yesterdayStr,
                weekStartStr,
                currentHourET,
                whoopTriggered,
                preview,
                whoopConnected,
                hasWhoopDataToday: hasWhoopData,
                whoopMorningReady,
                simulatedNoWhoop: simulateNoWhoop,
                userWasActive,
                dataAvailable: {
                    whoopSleepToday: hasWhoopData,
                    habitDataYesterday: hasHabitData,
                    journalYesterday: hasJournalData,
                },
                todayWorkoutType: todayWorkoutType || 'None/Rest',
                triggerTimes: triggerTimes || {},
                currentTimeET: `${String(currentHourET).padStart(2, '0')}:${String(currentMinuteET).padStart(2, '0')}`,
                wouldGenerate,
                durationMs: Date.now() - startTime,
            });
        }

        // ── Execution mode ──
        const results: StepResult[] = [];

        for (const step of steps) {
            if (!step.trigger) {
                results.push({ name: step.name, success: true, skipped: true, reason: step.reason });
                continue;
            }

            const stepStart = Date.now();
            try {
                switch (step.name) {
                    case 'weekly-plan': {
                        const res = await fetch(`${baseUrl}/api/productivity/workouts/weekly-plan`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ weekStart: weekStartStr }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });

                        // Re-query the freshly created plan so downstream steps use it
                        const { data: freshPlan } = await supabase.from('workout_weekly_plans')
                            .select('plan')
                            .eq('user_id', SINGLE_USER_ID)
                            .eq('week_start', weekStartStr)
                            .maybeSingle();
                        if (freshPlan?.plan) {
                            todayPlanEntry = freshPlan.plan[dayAbbrev];
                            todayWorkoutType = todayPlanEntry?.type || todayPlanEntry || null;
                            isRestDay = !todayWorkoutType || todayWorkoutType === 'Rest';
                            // Re-evaluate downstream step triggers
                            for (const s of steps) {
                                if (s.name === 'populate-daily-workout') {
                                    s.trigger = !isRestDay && !!freshPlan;
                                    s.reason = isRestDay ? 'Rest day' : 'Ready';
                                }
                                if (s.name === 'pre-coach-notes') {
                                    s.trigger = !coachTimeGate.blocked && !isRestDay && !existingCoachNotes && userWasActive && whoopMorningReady;
                                    s.reason = coachTimeGate.blocked ? coachTimeGate.reason : isRestDay ? 'Rest day' : !existingCoachNotes ? 'Ready' : 'Already exists';
                                }
                            }
                            console.log(`[Orchestrator] Sunday re-query: todayWorkout=${todayWorkoutType}, isRestDay=${isRestDay}`);
                        }
                        break;
                    }

                    case 'populate-daily-workout': {
                        // Create or update today's workout task from the weekly plan
                        const { data: existingWorkoutTasks } = await supabase
                            .from('daily_tasks')
                            .select('id, title, status')
                            .eq('date', todayLocalStr)
                            .or('title.ilike.%gym%,title.ilike.%push%,title.ilike.%pull%,title.ilike.%legs%');

                        if (existingWorkoutTasks && existingWorkoutTasks.length > 0) {
                            const existing = existingWorkoutTasks[0];
                            // Only update title if it changed AND task isn't already completed
                            if (existing.title !== todayWorkoutType && existing.status !== 'Completed') {
                                await supabase.from('daily_tasks')
                                    .update({ title: todayWorkoutType })
                                    .eq('id', existing.id);
                            }
                        } else {
                            await supabase.from('daily_tasks').insert({
                                date: todayLocalStr,
                                title: todayWorkoutType,
                                status: 'Pending',
                                is_one_off: false,
                                is_priority: false,
                                order: 50,
                            });
                        }

                        // Ensure Sauna companion task exists
                        {
                            const { data: saunaTasks } = await supabase
                                .from('daily_tasks')
                                .select('id')
                                .eq('date', todayLocalStr)
                                .ilike('title', '%sauna%');
                            if (!saunaTasks || saunaTasks.length === 0) {
                                await supabase.from('daily_tasks').insert({
                                    date: todayLocalStr,
                                    title: 'Sauna',
                                    status: 'Pending',
                                    is_one_off: false,
                                    is_priority: false,
                                    order: 51,
                                });
                            }
                        }

                        // Ensure Cold Plunge companion task exists
                        {
                            const { data: coldTasks } = await supabase
                                .from('daily_tasks')
                                .select('id')
                                .eq('date', todayLocalStr)
                                .or('title.ilike.%cold plunge%,title.ilike.%ice bath%');
                            if (!coldTasks || coldTasks.length === 0) {
                                await supabase.from('daily_tasks').insert({
                                    date: todayLocalStr,
                                    title: 'Cold Plunge',
                                    status: 'Pending',
                                    is_one_off: false,
                                    is_priority: false,
                                    order: 52,
                                });
                            }
                        }

                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        break;
                    }

                    case 'pre-coach-notes': {
                        const { generatePreCoachNotes } = await import('@/lib/workout-coach-helpers');
                        const weekPlanNote = typeof todayPlanEntry === 'object' ? todayPlanEntry?.note : null;
                        const result = await generatePreCoachNotes({
                            supabase, userId: SINGLE_USER_ID, workoutType: todayWorkoutType,
                            weekPlanNote, baseUrl,
                        });
                        if (!result) throw new Error('Coach returned null');
                        if (preview) {
                            // Mark the just-created coach note as preview
                            await supabase.from('coach_notes')
                                .update({ is_preview: true })
                                .eq('workout_type', todayWorkoutType)
                                .eq('coach_type', 'pre')
                                .gte('created_at', todayLocalStr + 'T00:00:00')
                                .lt('created_at', todayLocalStr + 'T23:59:59')
                                .eq('is_preview', false)
                                .order('created_at', { ascending: false })
                                .limit(1);
                        }
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        // Send notification (non-preview only)
                        if (!preview) {
                            try {
                                const { sendReportNotification, formatCoachNotes } = await import('@/lib/notifications');
                                const { subject, html, text } = formatCoachNotes(todayWorkoutType, result);
                                await sendReportNotification(subject, html, text);
                            } catch (emailErr) { console.error('[Orchestrator] Coach notes email failed:', emailErr); }
                        }
                        break;
                    }

                    case 'daily-report': {
                        const res = await fetch(`${baseUrl}/api/reports`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cadence: 'daily', date: todayLocalStr, preview }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        // Email handled by catch-up block below (reads from DB, not fetch response)
                        break;
                    }

                    case 'weekly-report': {
                        const res = await fetch(`${baseUrl}/api/reports`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cadence: 'weekly', date: todayLocalStr, preview }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        // Email handled by catch-up block below (reads from DB, not fetch response)
                        break;
                    }

                    case 'monthly-report': {
                        const res = await fetch(`${baseUrl}/api/reports`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cadence: 'monthly', date: todayLocalStr, preview }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        // Email handled by catch-up block below (reads from DB, not fetch response)
                        break;
                    }

                    case 'habit-insights': {
                        // Use a 30-day window ending yesterday
                        const insightEnd = yesterdayStr;
                        const insightStartDate = new Date(yesterdayStr + 'T12:00:00');
                        insightStartDate.setDate(insightStartDate.getDate() - 30);
                        const insightStart = formatDateStr(insightStartDate);

                        const res = await fetch(
                            `${baseUrl}/api/productivity/habit-insights?start=${insightStart}&end=${insightEnd}&refresh=true`
                        );
                        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
                        results.push({ name: step.name, success: true, durationMs: Date.now() - stepStart });
                        break;
                    }
                }
            } catch (err: any) {
                console.error(`[Orchestrator] Step "${step.name}" failed:`, err.message);
                results.push({ name: step.name, success: false, error: err.message, durationMs: Date.now() - stepStart });
            }
        }

        // ── Email catch-up: send emails for all completed reports that haven't been emailed ──
        // This covers both pre-existing reports AND reports just generated in this run.
        // Reads from the database (reliable) instead of parsing fetch responses (fragile).
        if (!preview && !dryRun) {
            const { sendReportNotification, formatDailyReport, formatWeeklyReport, formatMonthlyReport } = await import('@/lib/notifications');

            const emailTargets: { cadence: string; periodStart: string; formatter: (r: any) => { subject: string; html: string; text: string } }[] = [
                { cadence: 'daily', periodStart: yesterdayStr, formatter: formatDailyReport },
                ...(isSunday ? [{ cadence: 'weekly', periodStart: prevSundayStr, formatter: formatWeeklyReport }] : []),
                ...(todayDate.getDate() <= 3 ? [{ cadence: 'monthly', periodStart: lastMonthStartStr, formatter: formatMonthlyReport }] : []),
            ];

            for (const target of emailTargets) {
                try {
                    const { data: unemailed } = await supabase.from('ai_reports')
                        .select('id, report')
                        .eq('user_id', SINGLE_USER_ID)
                        .eq('cadence', target.cadence)
                        .eq('period_start', target.periodStart)
                        .eq('is_preview', false)
                        .eq('status', 'completed')
                        .is('emailed_at', null)
                        .maybeSingle();

                    if (unemailed) {
                        const { subject, html, text } = target.formatter(unemailed);
                        await sendReportNotification(subject, html, text);
                        await supabase.from('ai_reports')
                            .update({ emailed_at: new Date().toISOString() })
                            .eq('id', unemailed.id);
                        console.log(`[Orchestrator] Emailed ${target.cadence} report`);
                    }
                } catch (emailErr) {
                    console.error(`[Orchestrator] ${target.cadence} email failed:`, emailErr);
                }
            }
        }

        const totalMs = Date.now() - startTime;
        const triggered = results.filter(r => !r.skipped);
        const failed = triggered.filter(r => !r.success);

        console.log(`[Orchestrator] Done in ${totalMs}ms — ${triggered.length} triggered, ${failed.length} failed`);

        return NextResponse.json({
            success: failed.length === 0,
            timestamp: now.toISOString(),
            dayOfWeek,
            preview,
            userWasActive,
            results,
            durationMs: totalMs,
        });
    } catch (error: any) {
        console.error('[Orchestrator] Fatal error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
