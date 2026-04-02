export interface HabitInsightPromptData {
    insights: Array<{
        habitTitle: string;
        habitIcon: string;
        category: 'good' | 'bad';
        impactScore: number;
        avgScoreCompleted: number | null;
        avgScoreSkipped: number | null;
        recoveryImpact: number;
        completionRate: number;
        currentFrequency: number[] | null;
        optimalDaysPerWeek: number | null;
        frequencyAnalysis: Array<{ daysPerWeek: number; avgDayScore: number; weekCount: number }>;
        streakEffect: { avgScoreNoStreak: number | null; avgScoreOnStreak: number | null };
        sampleSize: number;
    }>;
    periodDays: number;
    dataQuality: string;
}

export function buildHabitInsightSystemPrompt(): string {
    return `You are a habit optimization coach. Analyze the correlation data and respond with ONLY valid JSON.

The impact scores measure how each habit affects overall Day Quality — a composite of recovery (40%), sleep (25%), habit completion (25%), and strain alignment (10%).

Rules:
- Keep each "reason" to 1 short sentence with one key number.
- "surprisingInsights" should be 2-3 short bullet points, each 1 sentence.
- No emojis or special symbols. Plain text only.
- Reference specific numbers from the data.

JSON SCHEMA (respond with ONLY this):
{
  "topHabits": [{ "title": "string", "reason": "string (1 sentence)" }],
  "frequencyChanges": [{ "title": "string", "current": "string", "recommended": "string", "reason": "string (1 sentence)" }],
  "surprisingInsights": ["string (1 sentence each, 2-3 bullet points)"],
  "dropCandidates": [{ "title": "string", "reason": "string (1 sentence)" }]
}`;
}

export function buildHabitInsightUserPrompt(data: HabitInsightPromptData): string {
    const sections: string[] = [];

    sections.push(`## Habit Correlation Analysis`);
    sections.push(`Period: ${data.periodDays} days | Data quality: ${data.dataQuality}`);

    sections.push(`\n## Habit Impact Rankings`);
    const sorted = [...data.insights].sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore));

    for (const h of sorted) {
        sections.push(`\n### ${h.habitTitle} (${h.category})`);
        sections.push(`Impact score (day quality diff): ${h.impactScore.toFixed(2)} | Completion rate: ${h.completionRate.toFixed(0)}% | Sample size: ${h.sampleSize}`);

        if (h.avgScoreCompleted != null && h.avgScoreSkipped != null) {
            sections.push(`Avg day quality when completed: ${h.avgScoreCompleted.toFixed(1)} | when skipped: ${h.avgScoreSkipped.toFixed(1)}`);
        }

        sections.push(`Recovery impact: ${h.recoveryImpact.toFixed(2)}`);

        if (h.streakEffect.avgScoreOnStreak != null && h.streakEffect.avgScoreNoStreak != null) {
            sections.push(`Streak effect — on streak: ${h.streakEffect.avgScoreOnStreak.toFixed(1)} | no streak: ${h.streakEffect.avgScoreNoStreak.toFixed(1)}`);
        }

        if (h.currentFrequency != null) {
            const daysPerWeek = h.currentFrequency.length || 7;
            sections.push(`Current frequency: ${daysPerWeek} days/week`);
        } else {
            sections.push(`Current frequency: 7 days/week (daily)`);
        }

        if (h.optimalDaysPerWeek != null) {
            sections.push(`Optimal frequency: ${h.optimalDaysPerWeek} days/week`);
        }

        if (h.frequencyAnalysis.length > 0) {
            const freqStr = h.frequencyAnalysis
                .map(f => `${f.daysPerWeek}x/wk: ${f.avgDayScore.toFixed(1)} avg (${f.weekCount} weeks)`)
                .join(' | ');
            sections.push(`Frequency breakdown: ${freqStr}`);
        }
    }

    sections.push(`\n---`);
    sections.push(`Based on the data above, provide:`);
    sections.push(`1. Top 3 habits to prioritize for day quality (with reasoning from the data)`);
    sections.push(`2. Frequency change recommendations (e.g., "increase meditation from 3x to 5x/week")`);
    sections.push(`3. One surprising insight from the correlations`);
    sections.push(`4. Any habits that may not be worth tracking`);
    sections.push(`\nGenerate the JSON now.`);

    return sections.join('\n');
}
