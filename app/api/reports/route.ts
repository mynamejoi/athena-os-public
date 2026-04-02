import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SINGLE_USER_ID } from '@/lib/constants';
import { assembleReportData, ReportCadence } from '@/lib/report-data';
import { buildSystemPrompt, buildUserPrompt, estimateTokens } from '@/lib/report-prompts';
import { generateCompletion } from '@/lib/llm';
import { logUsage } from '@/lib/usage';
import rateLimit from '@/lib/rate-limit';
// Timezone helpers available from '@/lib/date-utils' if needed

const reportLimiter = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 }); // 10 requests per hour

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return createClient(supabaseUrl, serviceKey);
}

const VALID_CADENCES: ReportCadence[] = ['daily', 'weekly', 'monthly', 'yearly'];

// ─── GET: List reports ───────────────────────────────────────────────────────

export async function GET(request: Request) {
    try {
        const supabase = getSupabase();
        const { searchParams } = new URL(request.url);
        const cadence = searchParams.get('cadence') as ReportCadence | null;
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        const previewParam = searchParams.get('preview') === 'true';

        let query = supabase
            .from('ai_reports')
            .select('*')
            .eq('user_id', SINGLE_USER_ID)
            .eq('is_preview', previewParam)
            .order('period_start', { ascending: false })
            .limit(limit);

        if (cadence) {
            if (!VALID_CADENCES.includes(cadence)) {
                return NextResponse.json({ error: `Invalid cadence. Must be one of: ${VALID_CADENCES.join(', ')}` }, { status: 400 });
            }
            query = query.eq('cadence', cadence);
        }

        if (start) query = query.gte('period_start', start);
        if (end) query = query.lte('period_start', end);

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json({ reports: data });
    } catch (e: any) {
        console.error('Reports GET error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ─── POST: Generate a report ─────────────────────────────────────────────────

function computePeriodDates(cadence: ReportCadence, date: string): { periodStart: string; periodEnd: string } {
    const d = new Date(date + 'T00:00:00');

    switch (cadence) {
        case 'daily': {
            // Morning briefing uses YESTERDAY's data as the basis
            const yesterday = new Date(d);
            yesterday.setDate(d.getDate() - 1);
            return { periodStart: formatDate(yesterday), periodEnd: formatDate(yesterday) };
        }

        case 'weekly': {
            // Weekly review = LAST WEEK (Sun-Sat), generated on Sunday to start the new week
            // Find last Sunday (start of prior week)
            const lastSunday = new Date(d);
            lastSunday.setDate(d.getDate() - d.getDay() - 7);
            const lastSaturday = new Date(lastSunday);
            lastSaturday.setDate(lastSunday.getDate() + 6);
            return {
                periodStart: formatDate(lastSunday),
                periodEnd: formatDate(lastSaturday),
            };
        }

        case 'monthly': {
            // Monthly review = LAST MONTH, generated on the 1st to start the new month
            const lastMonthEnd = new Date(d.getFullYear(), d.getMonth(), 0); // last day of prev month
            const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
            return {
                periodStart: formatDate(lastMonthStart),
                periodEnd: formatDate(lastMonthEnd),
            };
        }

        case 'yearly': {
            return {
                periodStart: `${d.getFullYear()}-01-01`,
                periodEnd: `${d.getFullYear()}-12-31`,
            };
        }
    }
}

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export async function POST(request: Request) {
    const rateLimitResponse = reportLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const supabase = getSupabase();
        const body = await request.json();

        const cadence = body.cadence as ReportCadence;
        const dryRun = body.dryRun === true; // Default false (live)
        const isPreview = body.preview === true;
        const dateInput = body.date || formatDate(new Date());

        // Select model based on cadence
        const modelMap: Record<ReportCadence, string> = {
            daily: 'claude-haiku-4-5-20251001',
            weekly: 'claude-haiku-4-5-20251001',
            monthly: 'claude-sonnet-4-5-20250929',
            yearly: 'claude-sonnet-4-5-20250929',
        };

        if (!cadence || !VALID_CADENCES.includes(cadence)) {
            return NextResponse.json(
                { error: `cadence is required and must be one of: ${VALID_CADENCES.join(', ')}` },
                { status: 400 }
            );
        }

        // ── Morning window gate ──
        // Auto-generated reports (daily/weekly/monthly) only generate between 5 AM and 2 PM ET.
        // This prevents any code path from creating reports at night, regardless of trigger source.
        // Manual/preview requests bypass this gate.
        // No time-of-day gate here — the orchestrator gates on WHOOP data availability.
        // Reports generate when today's recovery_score exists, not on a clock.

        const { periodStart, periodEnd } = computePeriodDates(cadence, dateInput);

        // Assemble data
        const dataPayload = await assembleReportData(supabase, cadence, periodStart, periodEnd);

        // Guard: for daily reports, check if there's any meaningful data
        if (cadence === 'daily') {
            const [taskCheck, journalCheck, whoopCheck] = await Promise.all([
                supabase
                    .from('daily_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('date', periodStart)
                    .eq('status', 'Completed'),
                supabase
                    .from('daily_summaries')
                    .select('journal_entry, win_of_the_day')
                    .eq('date', periodStart)
                    .maybeSingle(),
                supabase
                    .from('whoop_data')
                    .select('*', { count: 'exact', head: true })
                    .eq('date', periodStart),
            ]);

            const hasTasks = (taskCheck.count || 0) > 0;
            const hasJournal = !!journalCheck.data?.journal_entry || !!journalCheck.data?.win_of_the_day;
            const hasWhoop = (whoopCheck.count || 0) > 0;

            if (!hasTasks && !hasJournal && !hasWhoop) {
                return NextResponse.json(
                    { error: 'No data available for this date. Complete some habits first.' },
                    { status: 400 }
                );
            }
        }

        // Build prompts
        const systemPrompt = buildSystemPrompt(cadence);
        const userPrompt = buildUserPrompt(dataPayload, cadence);
        const estimatedTokenCount = estimateTokens(systemPrompt, userPrompt);

        if (dryRun) {
            // Store as dry_run
            const { data: inserted, error: insertError } = await supabase
                .from('ai_reports')
                .upsert({
                    user_id: SINGLE_USER_ID,
                    cadence,
                    period_start: periodStart,
                    period_end: periodEnd,
                    report: {},
                    data_snapshot: {
                        systemPrompt,
                        userPrompt,
                        dataPayload,
                        estimatedTokens: estimatedTokenCount,
                    },
                    model: modelMap[cadence],
                    status: 'dry_run',
                    is_preview: isPreview,
                }, {
                    onConflict: 'user_id,cadence,period_start,is_preview',
                })
                .select()
                .single();

            if (insertError) throw insertError;

            return NextResponse.json({
                id: inserted.id,
                status: 'dry_run',
                cadence,
                periodStart,
                periodEnd,
                systemPrompt,
                userPrompt,
                dataSnapshot: dataPayload,
                estimatedTokens: estimatedTokenCount,
            });
        }

        // ── Live generation ──────────────────────────────────────────────────

        // Mark as generating
        const { data: genRow, error: genInsertError } = await supabase
            .from('ai_reports')
            .upsert({
                user_id: SINGLE_USER_ID,
                cadence,
                period_start: periodStart,
                period_end: periodEnd,
                report: {},
                data_snapshot: { dataPayload },
                model: modelMap[cadence],
                status: 'generating',
                is_preview: isPreview,
            }, {
                onConflict: 'user_id,cadence,period_start,is_preview',
            })
            .select()
            .single();

        if (genInsertError) throw genInsertError;

        const startTime = Date.now();

        try {
            const selectedModel = modelMap[cadence];
            const maxTokensMap: Record<ReportCadence, number> = {
                daily: 2048,
                weekly: 2048,
                monthly: 4096,
                yearly: 4096,
            };
            const result = await generateCompletion({
                provider: 'anthropic',
                model: selectedModel,
                system: systemPrompt,
                prompt: userPrompt,
                temperature: 0.4,
                maxTokens: maxTokensMap[cadence],
            });

            const generationTimeMs = Date.now() - startTime;

            // Anthropic returns a string from generateCompletion
            const responseText = typeof result === 'string' ? result : (result as any).text || '';
            const usage = typeof result === 'string' ? null : (result as any).usage;

            let reportJson: any;
            try {
                reportJson = JSON.parse(responseText);
            } catch {
                // Try extracting JSON from markdown code blocks
                const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (jsonMatch) {
                    reportJson = JSON.parse(jsonMatch[1].trim());
                } else {
                    throw new Error('Failed to parse AI response as JSON');
                }
            }

            const tokensIn = usage?.prompt_tokens || 0;
            const tokensOut = usage?.completion_tokens || 0;

            // Calculate cost (Claude pricing)
            const selectedModelForCost = modelMap[cadence];
            const isHaiku = selectedModelForCost.includes('haiku');
            const inputRate = isHaiku ? 1.00 : 3.00;  // $/M tokens
            const outputRate = isHaiku ? 5.00 : 15.00; // $/M tokens
            const cost = (tokensIn / 1_000_000) * inputRate + (tokensOut / 1_000_000) * outputRate;

            // Update report row
            const { data: updatedReport, error: updateError } = await supabase
                .from('ai_reports')
                .update({
                    report: reportJson,
                    status: 'completed',
                    tokens_in: tokensIn,
                    tokens_out: tokensOut,
                    cost,
                    generation_time_ms: generationTimeMs,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', genRow.id)
                .select()
                .single();

            if (updateError) throw updateError;

            // Log usage
            await logUsage({
                provider: 'anthropic',
                model: modelMap[cadence],
                tokensIn,
                tokensOut,
                feature: `report_${cadence}` as any,
                userId: SINGLE_USER_ID,
            });

            return NextResponse.json({
                id: updatedReport.id,
                status: 'completed',
                cadence,
                periodStart,
                periodEnd,
                report: reportJson,
                tokensIn,
                tokensOut,
                cost,
                generationTimeMs,
            });

        } catch (aiError: any) {
            // Mark as failed
            await supabase
                .from('ai_reports')
                .update({
                    status: 'failed',
                    error_message: aiError.message || 'Unknown AI error',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', genRow.id);

            return NextResponse.json({
                id: genRow.id,
                status: 'failed',
                error: aiError.message || 'AI generation failed',
            }, { status: 500 });
        }

    } catch (e: any) {
        console.error('Reports POST error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
