import { NextRequest, NextResponse } from 'next/server';
import { analyzeHabitCorrelations } from '@/lib/habit-correlations';
import { buildHabitInsightSystemPrompt, buildHabitInsightUserPrompt } from '@/lib/habit-insight-prompt';
import { generateCompletion } from '@/lib/llm';
import { supabase } from '@/lib/supabase';
import rateLimit from '@/lib/rate-limit';

const insightLimiter = rateLimit({ limit: 10, windowMs: 60 * 60 * 1000 });
const CADENCE = 'habit-insights';

async function getCachedAi(start: string, end: string) {
    const { data } = await supabase
        .from('ai_reports')
        .select('report')
        .eq('cadence', CADENCE)
        .eq('period_start', start)
        .eq('period_end', end)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data?.report ?? null;
}

async function generateAndSaveInsights(start: string, end: string) {
    const correlations = await analyzeHabitCorrelations({ start, end });

    if (correlations.insights.length === 0 || correlations.dataQuality === 'insufficient') {
        return { correlations, aiRecommendations: null };
    }

    const systemPrompt = buildHabitInsightSystemPrompt();
    const userPrompt = buildHabitInsightUserPrompt({
        insights: correlations.insights.map(h => ({
            habitTitle: h.habitTitle,
            habitIcon: h.habitIcon,
            category: h.category,
            impactScore: h.impactScore,
            avgScoreCompleted: h.avgScoreCompleted,
            avgScoreSkipped: h.avgScoreSkipped,
            recoveryImpact: h.recoveryImpact,
            completionRate: h.completionRate,
            currentFrequency: h.currentFrequency,
            optimalDaysPerWeek: h.optimalDaysPerWeek,
            frequencyAnalysis: h.frequencyAnalysis,
            streakEffect: h.streakEffect,
            sampleSize: h.sampleSize,
        })),
        periodDays: correlations.periodDays,
        dataQuality: correlations.dataQuality,
    });

    const result = await generateCompletion({
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.4,
    });

    const responseText = typeof result === 'string' ? result : (result as any).text || '';
    let aiRecommendations = null;
    try {
        aiRecommendations = JSON.parse(responseText);
    } catch {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) aiRecommendations = JSON.parse(jsonMatch[1].trim());
    }

    if (aiRecommendations) {
        const { error } = await supabase.from('ai_reports').insert({
            cadence: CADENCE,
            period_start: start,
            period_end: end,
            report: aiRecommendations,
            model: 'claude-haiku-4-5-20251001',
            status: 'completed',
        });
        if (error) console.error('[habit-insights] Failed to cache:', error.message);
    }

    return { correlations, aiRecommendations };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        const forceRefresh = searchParams.get('refresh') === 'true';

        if (!start || !end) {
            return NextResponse.json({ error: 'start and end params required' }, { status: 400 });
        }

        if (forceRefresh) {
            // Manual refresh or auto-trigger: regenerate everything
            const rateLimitResponse = insightLimiter(request);
            if (rateLimitResponse) {
                return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
            }

            const { correlations, aiRecommendations } = await generateAndSaveInsights(start, end);
            return NextResponse.json({ correlations, aiRecommendations, cached: false });
        }

        // Normal page load: correlations + cached AI only, no AI generation
        const [correlations, cachedAi] = await Promise.all([
            analyzeHabitCorrelations({ start, end }),
            getCachedAi(start, end),
        ]);

        return NextResponse.json({
            correlations,
            aiRecommendations: cachedAi,
            cached: !!cachedAi,
        });
    } catch (e: any) {
        console.error('Habit insights GET error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
