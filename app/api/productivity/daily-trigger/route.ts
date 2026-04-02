import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SINGLE_USER_ID } from '@/lib/constants';
import { assembleReportData } from '@/lib/report-data';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/report-prompts';
import { generateCompletion } from '@/lib/llm';
import { logUsage } from '@/lib/usage';
import { toETDateString, getETYesterday, getETDayOfWeek } from '@/lib/date-utils';

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return createClient(supabaseUrl, serviceKey);
}

function formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// POST: Trigger daily report generation without WHOOP dependency
// Called from the Today view when WHOOP is disabled
export async function POST() {
    try {
        const supabase = getSupabase();
        const today = new Date();

        // Yesterday in ET is the period for the daily report
        const yesterdayStr = getETYesterday(today);

        // Check if a daily report already exists for today (period_start = yesterday)
        const { data: existing } = await supabase
            .from('ai_reports')
            .select('id, status')
            .eq('user_id', SINGLE_USER_ID)
            .eq('cadence', 'daily')
            .eq('period_start', yesterdayStr)
            .limit(1);

        if (existing && existing.length > 0 && existing[0].status === 'completed') {
            return NextResponse.json({ status: 'already_exists', reportId: existing[0].id });
        }

        // Assemble data and generate report
        const dataPayload = await assembleReportData(supabase, 'daily', yesterdayStr, yesterdayStr);
        const systemPrompt = buildSystemPrompt('daily');
        const userPrompt = buildUserPrompt(dataPayload, 'daily');

        const model = 'claude-haiku-4-5-20251001';
        const result = await generateCompletion({
            provider: 'anthropic',
            model,
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.4,
        });

        // Parse the JSON response
        const responseText = typeof result === 'string' ? result : (result as any).text || '';
        let report: any;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            report = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
        } catch {
            console.error('Failed to parse daily report response');
            return NextResponse.json({ error: 'Failed to parse report' }, { status: 500 });
        }

        // Upsert the report
        const { data: inserted, error: insertError } = await supabase
            .from('ai_reports')
            .upsert({
                user_id: SINGLE_USER_ID,
                cadence: 'daily',
                period_start: yesterdayStr,
                period_end: yesterdayStr,
                report,
                model,
                status: 'completed',
            }, {
                onConflict: 'user_id,cadence,period_start,is_preview',
            })
            .select('id')
            .single();

        if (insertError) throw insertError;

        // Log usage
        await logUsage({
            provider: 'anthropic',
            model,
            tokensIn: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
            tokensOut: Math.ceil(JSON.stringify(report).length / 4),
            feature: 'report_daily' as any,
            userId: SINGLE_USER_ID,
        }).catch(() => {});

        // Also check if weekly report is missing (on any day, not just Sunday — catches missed Sundays)
        const todayET = new Date(toETDateString(today) + 'T12:00:00');
        const dayOfWeek = getETDayOfWeek(today);
        const lastSunday = new Date(todayET);
        lastSunday.setDate(todayET.getDate() - dayOfWeek);
        const lastSundayStr = formatDate(lastSunday);
        const prevSunday = new Date(lastSunday);
        prevSunday.setDate(lastSunday.getDate() - 7);
        const prevSundayStr = formatDate(prevSunday);
        const prevSaturdayStr = formatDate(new Date(prevSunday.getTime() + 6 * 86400000));

        const { data: existingWeekly } = await supabase
            .from('ai_reports')
            .select('id')
            .eq('user_id', SINGLE_USER_ID)
            .eq('cadence', 'weekly')
            .eq('period_start', prevSundayStr)
            .limit(1);

        let weeklyGenerated = false;
        if (!existingWeekly || existingWeekly.length === 0) {
            try {
                const weeklyData = await assembleReportData(supabase, 'weekly', prevSundayStr, prevSaturdayStr);
                const weeklySystem = buildSystemPrompt('weekly');
                const weeklyUser = buildUserPrompt(weeklyData, 'weekly');

                const weeklyResult = await generateCompletion({
                    provider: 'anthropic',
                    model,
                    system: weeklySystem,
                    prompt: weeklyUser,
                    temperature: 0.4,
                });

                const weeklyText = typeof weeklyResult === 'string' ? weeklyResult : (weeklyResult as any).text || '';
                const weeklyMatch = weeklyText.match(/\{[\s\S]*\}/);
                const weeklyReport = weeklyMatch ? JSON.parse(weeklyMatch[0]) : JSON.parse(weeklyText);

                await supabase.from('ai_reports').upsert({
                    user_id: SINGLE_USER_ID,
                    cadence: 'weekly',
                    period_start: prevSundayStr,
                    period_end: prevSaturdayStr,
                    report: weeklyReport,
                    model,
                    status: 'completed',
                }, { onConflict: 'user_id,cadence,period_start,is_preview' });

                weeklyGenerated = true;
            } catch (weeklyErr) {
                console.error('Weekly report fallback error:', weeklyErr);
            }
        }

        return NextResponse.json({ status: 'generated', reportId: inserted?.id, weeklyGenerated });
    } catch (e: any) {
        console.error('Daily trigger error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
