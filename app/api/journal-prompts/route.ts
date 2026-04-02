import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SINGLE_USER_ID } from '@/lib/constants';
import { assembleReportData } from '@/lib/report-data';
import { buildJournalPromptsSystemPrompt, buildJournalPromptsUserPrompt } from '@/lib/report-prompts';
import { generateCompletion } from '@/lib/llm';
import { logUsage } from '@/lib/usage';
import rateLimit from '@/lib/rate-limit';

const promptLimiter = rateLimit({ limit: 20, windowMs: 60 * 60 * 1000 });

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

export async function POST(request: Request) {
    const rateLimitResponse = promptLimiter(request);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const supabase = getSupabase();
        const body = await request.json();

        const dateInput = body.date || formatDate(new Date());
        const force = body.force === true;

        // Check cache first
        if (!force) {
            const { data: existing } = await supabase
                .from('daily_summaries')
                .select('journal_prompts')
                .eq('date', dateInput)
                .single();

            if (existing?.journal_prompts) {
                return NextResponse.json({
                    prompts: existing.journal_prompts,
                    cached: true,
                });
            }
        }

        // Compute yesterday's date for the daily report data
        const dateObj = new Date(dateInput + 'T00:00:00');
        const yesterday = new Date(dateObj);
        yesterday.setDate(dateObj.getDate() - 1);
        const periodStart = formatDate(yesterday);
        const periodEnd = formatDate(yesterday);

        // Assemble data using daily cadence
        const dataPayload = await assembleReportData(supabase, 'daily', periodStart, periodEnd);

        // Build prompts
        const systemPrompt = buildJournalPromptsSystemPrompt();
        const userPrompt = buildJournalPromptsUserPrompt(dataPayload);

        const model = 'claude-haiku-4-5-20251001';

        const result = await generateCompletion({
            provider: 'anthropic',
            model,
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
        });

        const responseText = typeof result === 'string' ? result : (result as any).text || '';

        let prompts: string[];
        try {
            prompts = JSON.parse(responseText);
        } catch {
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                prompts = JSON.parse(jsonMatch[1].trim());
            } else {
                throw new Error('Failed to parse journal prompts as JSON');
            }
        }

        // Validate it's an array of strings
        if (!Array.isArray(prompts) || prompts.some(p => typeof p !== 'string')) {
            throw new Error('Invalid journal prompts format');
        }

        // Cache in daily_summaries
        await supabase
            .from('daily_summaries')
            .upsert(
                { date: dateInput, journal_prompts: prompts },
                { onConflict: 'date' }
            );

        // Log usage
        await logUsage({
            provider: 'anthropic',
            model,
            feature: 'journal_prompts' as any,
            userId: SINGLE_USER_ID,
        });

        return NextResponse.json({
            prompts,
            cached: false,
        });
    } catch (e: any) {
        console.error('Journal prompts error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
