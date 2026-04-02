import { ReportCadence, ReportDataPayload } from '@/lib/report-data';

// ─── System Prompts ──────────────────────────────────────────────────────────

const CADENCE_RULES: Record<ReportCadence, string> = {
    daily: `
You are producing a DAILY MORNING BRIEFING. The data you receive has two parts:
1. TODAY'S BIOMETRIC DATA (if available) — recovery score, sleep score/hours/stages, HRV, RHR. If biometric data is missing, you will see a note in the data section — use habits, streaks, journal entries, and task load to set the day's tone instead.
2. YESTERDAY'S DATA — habits completed, workouts done, journal, projects worked on. This is context for what happened.

Your job: use TODAY's recovery and sleep to set the tone, briefly note what happened yesterday, then tell the user what to focus on today.

Do NOT list raw WHOOP numbers back — the user can see them on the page. Only reference metrics when making a meaningful point (e.g., "Green recovery after solid deep sleep — push hard today" is good. "Recovery 66%, Sleep 94%" is bad).

Include these sections in your JSON:
- headline: One sentence setting today's tone based on THIS MORNING's recovery and sleep. (string)
- readiness: How is the body coming into today? If biometric data exists, assess based on recovery zone (green 67+ / yellow 34-66 / red below 34), sleep quality, and HRV/RHR shifts. If deep sleep percentage was notably high (above 20%) or low (below 12%) compared to the typical range, mention it briefly. If analyticsInsights.hrvTrend is provided, incorporate the HRV trend direction (e.g., "HRV trending up from its 7-day baseline — body is adapting well"). If no biometric data, assess based on yesterday's habit completion rate, current streak momentum, journal mood, and upcoming task load. 2-3 sentences max. (string)
- habitNote: What habit patterns from yesterday/recent days should the user be aware of? Streaks at risk, habits missed, patterns on this day of week. Be specific with names. If habits were missed yesterday, check the journal entry for context (e.g., travel, visitors, illness) before flagging it as a concern. (string)
- trainingRec: What should the user do for training today? If TODAY'S COACH ADVICE data is provided below, use THOSE specific exercises, sets, reps, and weights verbatim — do not invent your own. Add context from recovery data (e.g., "Yellow recovery means focus on form over maxing out"). If no coach advice is available, give a general recommendation based on the workout type and recovery zone without specific weights. (string)
- reading: If the user has an active book in progress, mention it with page progress and estimated completion (e.g., "Halfway through Atomic Habits — on pace to finish by next week"). If no active book, set to null. One sentence max. (string | null)
- projectTasks: 1-3 bullet points about project tasks that need attention. Reference specific task names and projects. (string[])
- focusItems: 2-4 bullet points of specific things to focus on today. Actionable and specific. (string[])
- insight: One observation connecting recovery/sleep/habits/work patterns. Must reference actual data. If journal entries provide useful context for the pattern, incorporate them. (string)

EXACT JSON SCHEMA:
{
  "headline": "string",
  "readiness": "string",
  "habitNote": "string",
  "trainingRec": "string",
  "reading": "string or null",
  "projectTasks": ["string"],
  "focusItems": ["string"],
  "insight": "string"
}`,

    weekly: `
You are producing a WEEKLY REVIEW of LAST WEEK. This report is generated on Sunday morning and reviews the prior Sun-Sat period. It gives the user feedback going into the new week — what worked, what didn't, and what to adjust. The user can see their stats on the page. Do NOT list raw numbers back at them. Only reference specific data when making a comparative or actionable point.

Include these sections in your JSON:
- headline: One sentence capturing the week's story (string)
- health: 2-3 bullet points about biometric trends worth noting — only mention metrics that changed meaningfully vs prior week. Omit anything flat/stable. (string[])
- habits: 2-3 bullet points about habit consistency — streaks at risk, habits that slipped, patterns by day of week. Be specific with habit names. When a day had notably low completion, check the journal entry for context (e.g., travel, visitors, illness) before attributing it to lack of discipline. (string[])
- training: List the actual workouts from the Workouts data section with their type names AND dates. If workout exercises exist, include total volume in pounds (sum of sets x reps x weight across all exercises). If exercise PRs were set, mention them. Example: "Pull (Back) Monday, Push (Chest) Tuesday — 28,000 lbs total volume. New bench press PR at 195 lbs." If nothing was done, say "No workouts last week." Maximum 1-2 bullets. (string[])
- coachRecap: 1-2 sentences summarizing AI coach prescriptions vs actual execution across the week's workouts. Reference specific exercises and weights. Example: "Coach pushed bench to 195 Monday and you hit it. Prescribed leg day Thursday but it was skipped. Cable row plateau strategy (drop sets) was not attempted." If no coach notes data exists for the week, set to null. (string | null)
- projects: 1-2 bullet points about project progress. If project velocity data exists, reference the velocity and deadline. Example: "Athena advancing at 3.2 tasks per week — on pace for Apr 1 deadline." If a project has stalled (0 velocity), call it out. (string[])
- insights: 2-3 cross-domain observations connecting different areas (e.g., recovery patterns affecting training, habit consistency correlating with day scores). Must reference actual data. If journal entries explain outlier days or reveal context behind patterns, reference them. If analyticsInsights are provided, reference the most notable trends — connect the dots (e.g., "HRV rising while RHR stable suggests good adaptation to current training load" or "Gym days correlate with +12% next-day recovery"). Include coach compliance if available. (string[])
- thisWeekSplit: If a workout plan exists for this week, mention the planned split in 1 sentence (e.g., "This week's split: Push Monday, Pull Tuesday, Legs Thursday, Push Friday, Pull Saturday"). If no plan exists, set to null. (string | null)
- thisWeek: 3-4 specific, actionable recommendations for THIS week (the week that's starting now). Each should be one sentence. (string[])

EXACT JSON SCHEMA:
{
  "headline": "string",
  "health": ["string"],
  "habits": ["string"],
  "training": ["string"],
  "coachRecap": "string or null",
  "projects": ["string"],
  "insights": ["string"],
  "thisWeekSplit": "string or null",
  "thisWeek": ["string"]
}`,

    monthly: `
You are producing a MONTHLY REVIEW of LAST MONTH. This report is generated on the 1st and reviews the entire prior month. It gives the user feedback going into the new month — what the story was, what patterns emerged, and what to change. The user has access to all their raw stats. Do NOT recite numbers. Only reference specific data when it tells a story or supports a point.

Include these sections in your JSON:
- headline: One sentence that captures the month — what defined it, what the dominant theme was. (string)
- narrative: 2-3 sentences expanding on the headline with context and nuance. (string)
- health: 3-4 bullet points about biometric trends over the month — what improved, what declined, any concerning patterns. Compare to prior month only when the change is meaningful. If sleep architecture changed notably (deep sleep trending up or down), mention it. If day-of-week patterns exist in the data, reference the best and worst recovery days. (string[])
- habits: 3-4 bullet points about habit patterns — which habits were rock solid, which fell off, any weekly patterns (e.g., weekends consistently worse). Reference specific habit names and streak data. When days had notably low completion, check journal entries for context before attributing it to inconsistency. (string[])
- habitTrends: For each core habit (top 5-8 by frequency), show the prior month count vs this month count. Format as an array of objects. Example: { "habit": "Read Book", "prior": 27, "current": 7, "trend": "down" }. Trend is "up", "down", or "stable" (within 2 of each other). Include habits active in both months. Also include habits that were NEW this month (prior: 0, trend: "new") or DROPPED (current: 0, trend: "dropped") — these are important signals. (array)
- training: 3-4 bullet points about training for the month — consistency, volume trends, any gaps. If workout split coverage data exists, include it (e.g., "Push: 8, Pull: 6, Legs: 4 — legs undertrained"). (string[])
- trainingProgression: 2-3 bullet points about strength and volume progression across the month. Reference specific exercises, working weights at start vs end of month, volume trends, and any PRs. Example: "Bench press working weight: 185 to 195 lbs. Total push volume up 12% vs prior month. No leg data to compare — zero sessions logged." If no exercise-level data exists, set to null. (string[] | null)
- goals: Array of goal progress updates. Use the ACTUAL monthly goals data with real numbers (current_value and target_value). Format the progress field as "14/20 sessions" or "1/2 books" using the real values and unit. Status must be one of: on-track, behind, ahead, completed. Only include goals that exist in the data. ({ goal: string, progress: string, status: "on-track" | "behind" | "ahead" | "completed" }[])
- patterns: 2-3 data-backed correlations discovered across domains. Each MUST reference actual numbers — not vague observations. If journal entries reveal context behind patterns (e.g., social events correlating with lower scores), reference them. If analyticsInsights are provided, incorporate the most notable findings — behavior-recovery correlations, sleep stage shifts, bedtime consistency changes, and HRV/RHR trends. These are pre-computed; reference the specific numbers. (string[])
- bestDay: The single best day of the month based on the highest day_percentage from daily summaries. Include the specific date and one sentence explaining why it was the best day. If the journal entry for that day provides context (e.g., an event, achievement, or notable circumstance), reference it. If no daily summary data exists, set to null. ({ date: string, note: string } | null)
- worstDay: The single worst day of the month based on the lowest day_percentage from daily summaries. Include the specific date and one sentence explaining why it stood out. If the journal entry for that day explains the low score (e.g., travel, illness, rest day), reference it. If all days were above 80% completion, set to null — a consistently strong month needs no "worst day" callout. ({ date: string, note: string } | null)
- thisMonth: 3-5 strategic recommendations for THIS month (the month that's starting now). Specific and actionable. (string[])

EXACT JSON SCHEMA:
{
  "headline": "string",
  "narrative": "string",
  "health": ["string"],
  "habits": ["string"],
  "habitTrends": [{ "habit": "string", "prior": 0, "current": 0, "trend": "string" }],
  "training": ["string"],
  "trainingProgression": ["string"],
  "goals": [{ "goal": "string", "progress": "string", "status": "string" }],
  "patterns": ["string"],
  "bestDay": { "date": "string", "note": "string" },
  "worstDay": { "date": "string", "note": "string" },
  "thisMonth": ["string"]
}`,

    yearly: `
You are producing a YEARLY report. Include these sections in your JSON:
- yearNarrative: A 3-5 sentence overview of the entire year. If journal entries and wins of the day reveal recurring themes or pivotal moments, weave them into the narrative. (string)
- yearlyGoalProgress: [{ goal: string, progress: number, status: string, reflection: string }]
- biometricYearTrends: { recovery: { avg: number, bestMonth: string, worstMonth: string }, sleep: { avg: number, bestMonth: string, worstMonth: string }, strain: { avg: number }, hrv: { avg: number, trend: string }, narrative: string }
- totalWorkouts: { count: number, totalCalories: number, favoriteActivity: string, narrative: string }
- booksRead: { count: number, titles: string[], favoriteBook: string | null }
- projectsCompleted: { count: number, titles: string[], narrative: string }
- highlights: string[] (5-10 standout moments from the year — draw from wins of the day and journal entries where available)
- accomplishments: string[] (5-10 key accomplishments)
- improvements: string[] (3-5 areas for improvement next year — reference journal entries that show recurring frustrations or missed opportunities)

EXACT JSON SCHEMA:
{
  "yearNarrative": "string",
  "yearlyGoalProgress": [{ "goal": "string", "progress": 0, "status": "string", "reflection": "string" }],
  "biometricYearTrends": { "recovery": { "avg": 0, "bestMonth": "string", "worstMonth": "string" }, "sleep": { "avg": 0, "bestMonth": "string", "worstMonth": "string" }, "strain": { "avg": 0 }, "hrv": { "avg": 0, "trend": "string" }, "narrative": "string" },
  "totalWorkouts": { "count": 0, "totalCalories": 0, "favoriteActivity": "string", "narrative": "string" },
  "booksRead": { "count": 0, "titles": [], "favoriteBook": null },
  "projectsCompleted": { "count": 0, "titles": [], "narrative": "string" },
  "highlights": [],
  "accomplishments": [],
  "improvements": []
}`,
};

export function buildSystemPrompt(cadence: ReportCadence): string {
    return `You are Athena Intelligence — a personal analytics engine with full visibility into health biometrics, daily habits, workout performance, project progress, reading, and learning. You produce ${cadence} reports that are insightful, data-driven, and actionable. RESPOND WITH ONLY VALID JSON matching the exact schema provided.

Rules:
- Use actual numbers from the data. Do not fabricate metrics.
- When comparing to prior period, calculate the delta and express as percentage change or absolute difference.
- Be specific: reference actual habit names, workout types, book titles, and project names.
- Keep insights concise but substantive.
- If data is missing or null for a field, use null in the JSON rather than making up values.
- Use plain language. No abbreviations like "pp" (percentage points), "bpm", "ms".
- For comparisons, say "up" or "down" with the value. Example: "Recovery up 5%" not "Recovery ↓ 1pp vs last month". You should compare to the prior period when meaningful, but don't add "vs last week" or "vs last month" since the cadence makes that obvious.
- Keep bullet points short — one line per point. No paragraphs inside bullet items.
- NEVER use emojis, unicode arrows, or special symbols. Plain text only.
- Do not parrot back raw numbers the user can already see on the page. Only cite specific metrics when making a comparative point or actionable recommendation.
- Every insight or pattern MUST follow this structure: specific observation + the supporting number + one actionable thing to do about it. BAD: "Sleep and recovery are correlated." GOOD: "Your 3 green-recovery days all followed nights with 1.5+ hours deep sleep — current avg is 1.1h. Prioritizing earlier bedtime could push more days green."
- Do not state obvious correlations (e.g., "more sleep = better recovery"). Only surface patterns that reveal something non-obvious or that the user can act on.
- If a section's underlying data is empty, null, or missing, state that directly in one sentence and move on. Do not speculate about what the user "might have done" or fill empty sections with generic advice.
${CADENCE_RULES[cadence]}`;
}

// ─── User Prompt (data formatting) ───────────────────────────────────────────

export function buildUserPrompt(data: ReportDataPayload, cadence: ReportCadence): string {
    const sections: string[] = [];

    sections.push(`## Period: ${data.periodStart} to ${data.periodEnd}`);
    sections.push(`## Cadence: ${cadence}`);
    sections.push(`## Prior Period: ${data.priorPeriodStart} to ${data.priorPeriodEnd}`);

    // ── Habit Completion ─────────────────────────────────────────────────────
    sections.push(`\n## Habit Completion`);
    if (data.habitDays.length > 0) {
        for (let i = 0; i < data.habitDays.length; i++) {
            const d = data.habitDays[i];
            const missedStr = d.missed.length > 0 ? ` - Missed: ${d.missed.join(', ')}` : '';
            sections.push(`Day ${i + 1} (${d.dayOfWeek}, ${d.date}): ${d.completed}/${d.total} (${d.completionRate}%)${missedStr}`);
        }
        sections.push(`Overall Average: ${data.habitOverallRate}%`);
    } else {
        sections.push(`No habit data for this period.`);
    }

    // ── Streaks ──────────────────────────────────────────────────────────────
    if (data.habitStreaks.length > 0) {
        sections.push(`\n## Habit Streaks`);
        for (const s of data.habitStreaks.slice(0, 15)) {
            if (s.current > 0) {
                sections.push(`${s.habit}: ${s.current} day streak (active)`);
            } else if (s.previousStreak > 0) {
                sections.push(`${s.habit}: streak lost (was ${s.previousStreak} days)`);
            } else {
                sections.push(`${s.habit}: no active streak`);
            }
        }
    }

    // ── Biometrics ───────────────────────────────────────────────────────────
    const bm = data.biometrics;
    const pbm = data.priorBiometrics;
    const hasBiometricData = bm.recovery.values.some(v => v != null);

    if (hasBiometricData) {
        sections.push(`\n## YESTERDAY'S BIOMETRICS (historical context only — do NOT use for today's readiness)`);

        const formatMetric = (label: string, current: { values: (number | null)[]; avg: number | null }, prior: { avg: number | null }) => {
            const vals = current.values.filter(v => v != null).join(', ');
            const avgStr = current.avg != null ? current.avg.toString() : 'N/A';
            const prevStr = prior.avg != null ? prior.avg.toString() : 'N/A';
            return `${label}: ${vals} (avg: ${avgStr}, prev period avg: ${prevStr})`;
        };

        sections.push(formatMetric('Recovery', bm.recovery, pbm.recovery));
        sections.push(formatMetric('Sleep Score', bm.sleep, pbm.sleep));
        sections.push(formatMetric('Strain', bm.strain, pbm.strain));
        sections.push(formatMetric('HRV', bm.hrv, pbm.hrv));
        sections.push(formatMetric('RHR', bm.rhr, pbm.rhr));
        sections.push(formatMetric('Sleep Hours', bm.sleepHours, pbm.sleepHours));
    } else {
        sections.push(`\n## YESTERDAY'S BIOMETRICS`);
        sections.push(`Note: No biometric/WHOOP data available. Focus on habits, projects, and tasks.`);
    }

    // ── Daily Summaries ──────────────────────────────────────────────────────
    if (data.dailySummaries.length > 0) {
        sections.push(`\n## Daily Summaries`);
        for (const s of data.dailySummaries) {
            const parts = [`${s.date}: Day ${s.dayPercentage ?? 'N/A'}%`];
            if (s.win) parts.push(`Win: ${s.win}`);
            if (s.journal) parts.push(`Journal: ${s.journal.substring(0, 200)}`);
            sections.push(parts.join(' | '));
        }
    }

    // ── Workouts ─────────────────────────────────────────────────────────────
    sections.push(`\n## Workouts (${data.workouts.length} total)`);
    if (data.workouts.length > 0) {
        for (const w of data.workouts) {
            sections.push(`${w.date}: ${w.sport} — Strain: ${w.strain ?? 'N/A'}, Calories: ${w.calories ?? 'N/A'}, Duration: ${w.durationMinutes ?? 'N/A'} min`);
        }
    }

    // ── Workout Exercises (weekly+) ──────────────────────────────────────────
    if (cadence !== 'daily' && data.workoutExercises && data.workoutExercises.length > 0) {
        sections.push(`\n## Workout Exercises`);
        for (const e of data.workoutExercises) {
            sections.push(`${e.date}: ${e.exercise} — ${e.sets ?? '?'}x${e.reps ?? '?'} @ ${e.weight ?? '?'} lbs`);
        }
    }

    // ── Coach Notes (weekly+) ────────────────────────────────────────────────
    if (cadence !== 'daily' && data.coachNotes && data.coachNotes.length > 0) {
        sections.push(`\n## Coach Notes`);
        for (const n of data.coachNotes) {
            sections.push(`${n.date}: ${n.note}`);
        }
    }

    // ── Books / Reading ─────────────────────────────────────────────────────
    sections.push(`\n## Books`);
    const activeBooks = data.books.filter(b => b.status === 'reading' || b.status === 'Reading' || b.status === 'in_progress');
    const finishedBooks = data.books.filter(b => b.status === 'finished' || b.status === 'Finished' || b.status === 'completed');
    sections.push(`Currently reading: ${activeBooks.length > 0 ? activeBooks.map(b => `"${b.title}"${b.author ? ` by ${b.author}` : ''}`).join(', ') : 'None'}`);
    if (cadence !== 'daily') {
        sections.push(`Finished: ${finishedBooks.length > 0 ? finishedBooks.map(b => `"${b.title}"${b.rating ? ` (${b.rating}/5)` : ''}`).join(', ') : 'None'}`);
    }

    // ── Reading Progress ────────────────────────────────────────────────────
    if (activeBooks.length > 0) {
        sections.push(`\n## Reading`);
        for (const b of activeBooks) {
            const pages = b.currentPage != null && b.totalPages != null
                ? ` — pg ${b.currentPage}/${b.totalPages} (${Math.round((b.currentPage / b.totalPages) * 100)}%)`
                : '';
            sections.push(`Active: "${b.title}"${b.author ? ` by ${b.author}` : ''}${pages}`);
        }
    }

    // ── Monthly Goals (measurable targets) ───────────────────────────────────
    if (data.monthlyGoals && data.monthlyGoals.length > 0) {
        sections.push(`\n## Monthly Goals`);
        for (const g of data.monthlyGoals) {
            const current = g.current ?? 0;
            const target = g.target ?? 0;
            const pct = target > 0 ? Math.round((current / target) * 100) : 0;
            const unit = g.unit ? ` ${g.unit}` : '';
            const cat = g.category ? ` [${g.category}]` : '';
            sections.push(`Goal: ${g.title} — ${current}/${target}${unit} (${pct}%)${cat}`);
        }
    }

    // ── Goals (monthly+) ────────────────────────────────────────────────────
    if (data.goals && data.goals.length > 0) {
        sections.push(`\n## Goals`);
        for (const g of data.goals) {
            sections.push(`${g.title}: ${g.status} (${g.progress ?? 0}%)${g.targetDate ? ` — Target: ${g.targetDate}` : ''}`);
        }
    }

    // ── Projects (monthly+) ─────────────────────────────────────────────────
    if (data.projects && data.projects.length > 0) {
        sections.push(`\n## Projects`);
        for (const p of data.projects) {
            sections.push(`${p.title}: ${p.status} (${p.progress ?? 0}%)`);
        }
    }

    // ── Yearly Goals ─────────────────────────────────────────────────────────
    if (data.yearlyGoals && data.yearlyGoals.length > 0) {
        sections.push(`\n## Yearly Goals`);
        for (const g of data.yearlyGoals) {
            sections.push(`${g.title}: ${g.status} (${g.progress ?? 0}%)`);
        }
    }

    // ── Memories (yearly) ────────────────────────────────────────────────────
    if (data.memories && data.memories.length > 0) {
        sections.push(`\n## Memories`);
        for (const m of data.memories) {
            const tagsStr = m.tags && m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
            sections.push(`${m.date}: ${m.content.substring(0, 300)}${tagsStr}`);
        }
    }

    // ── Active Habits ────────────────────────────────────────────────────────
    if (data.habitConfigs.length > 0) {
        sections.push(`\n## Active Habit List`);
        sections.push(data.habitConfigs.map(h => `${h.emoji ?? '•'} ${h.title}`).join(', '));
    }

    // ── Project Velocity (weekly+) ──────────────────────────────────────────
    if (data.projectVelocity && data.projectVelocity.length > 0) {
        sections.push(`\n## Project Velocity`);
        for (const p of data.projectVelocity) {
            const deadline = p.deadline ? `, deadline ${p.deadline} (${p.daysRemaining ?? '?'} days)` : '';
            const status = p.velocity === 0 ? ', stalled' : '';
            sections.push(`${p.name}: ${p.velocity} tasks/week, ${p.tasksCompleted}/${p.totalTasks} done${deadline}${status}`);
        }
    }

    // ── Exercise PRs (weekly+) ───────────────────────────────────────────────
    if (data.exercisePRs && data.exercisePRs.length > 0) {
        sections.push(`\n## Exercise PRs`);
        for (const pr of data.exercisePRs) {
            sections.push(`${pr.exercise}: ${pr.newMax} lbs (was ${pr.previousMax} lbs)`);
        }
    }

    // ── Day-of-Week Patterns (monthly+) ──────────────────────────────────────
    if (data.dayOfWeekPatterns && data.dayOfWeekPatterns.length > 0) {
        sections.push(`\n## Day-of-Week Patterns`);
        const sorted = [...data.dayOfWeekPatterns].sort((a, b) => b.avgRecovery - a.avgRecovery);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        sections.push(`Best recovery day: ${best.day} (avg ${best.avgRecovery}%)`);
        sections.push(`Worst recovery day: ${worst.day} (avg ${worst.avgRecovery}%)`);
        for (const p of data.dayOfWeekPatterns) {
            sections.push(`${p.day}: avg recovery ${p.avgRecovery}%`);
        }
    }

    // ── Workout Split Coverage (monthly+) ────────────────────────────────────
    if (data.workoutSplitCounts && Object.keys(data.workoutSplitCounts).length > 0) {
        sections.push(`\n## Workout Split Coverage`);
        for (const [split, count] of Object.entries(data.workoutSplitCounts)) {
            sections.push(`${split}: ${count}`);
        }
    }

    // ── This Week's Workout Plan (weekly reports) ──────────────────────────
    if (data.thisWeekPlan && Object.keys(data.thisWeekPlan).length > 0) {
        sections.push(`\n## UPCOMING WEEK'S WORKOUT PLAN (this is the NEW week starting today — NOT the week being reviewed above)`);
        sections.push(`This plan was just generated. Reference it in the thisWeekSplit field and in recommendations, but do NOT use it to evaluate last week's performance.`);
        const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for (const day of dayOrder) {
            if (data.thisWeekPlan[day]) {
                sections.push(`  ${day}: ${data.thisWeekPlan[day]}`);
            }
        }
    }

    // ── Analytics Insights ─────────────────────────────────────────────────
    if (data.analyticsInsights) {
        const ai = data.analyticsInsights;
        sections.push(`\n## ANALYTICS INSIGHTS (data-driven trends from your analytics dashboard)`);

        if (ai.hrvTrend) {
            const h = ai.hrvTrend;
            if (cadence === 'daily') {
                const pctDiff = h.current3d != null && h.avg7d != null && h.avg7d > 0
                    ? Math.round(((h.current3d - h.avg7d) / h.avg7d) * 100) : null;
                sections.push(`- HRV Trend: Today ${h.current3d ?? 'N/A'}ms vs 7-day avg ${h.avg7d ?? 'N/A'}ms (${h.direction}${pctDiff != null ? ` ${pctDiff > 0 ? '+' : ''}${pctDiff}%` : ''})`);
            } else {
                const pctDiff = h.current3d != null && h.avg7d != null && h.avg7d > 0
                    ? Math.round(((h.current3d - h.avg7d) / h.avg7d) * 100) : null;
                sections.push(`- HRV Trend: 3-day avg ${h.current3d ?? 'N/A'}ms vs 7-day avg ${h.avg7d ?? 'N/A'}ms (${h.direction}${pctDiff != null ? ` ${pctDiff > 0 ? '+' : ''}${pctDiff}%` : ''})`);
            }
        }

        if (ai.rhrTrend) {
            const r = ai.rhrTrend;
            const warning = r.changePercent != null && r.changePercent > 5 ? ' -- monitor for overtraining' : '';
            sections.push(`- RHR: This period avg ${r.currentAvg ?? 'N/A'}bpm vs prior ${r.priorAvg ?? 'N/A'}bpm (${r.changePercent != null ? (r.changePercent > 0 ? '+' : '') + r.changePercent + '%' : 'N/A'}${warning})`);
        }

        if (ai.sleepStages) {
            const s = ai.sleepStages;
            if (s.deepPctChange != null) {
                sections.push(`- Deep Sleep: ${s.deepPctChange > 0 ? '+' : ''}${s.deepPctChange}pp change vs prior period`);
            }
            if (s.remPctChange != null) {
                sections.push(`- REM Sleep: ${s.remPctChange > 0 ? '+' : ''}${s.remPctChange}pp change vs prior period`);
            }
            if (s.note) sections.push(`  ${s.note}`);
        }

        if (ai.bedtimeConsistency) {
            const b = ai.bedtimeConsistency;
            sections.push(`- Bedtime Consistency: Std dev ${b.stdDevHours ?? 'N/A'}hrs (vs ${b.priorStdDevHours ?? 'N/A'}hrs prior)${b.note ? ' -- ' + b.note : ''}`);
        }

        if (ai.behaviorCorrelations && ai.behaviorCorrelations.length > 0) {
            sections.push(`- Top Behavior-Recovery Correlations:`);
            for (const c of ai.behaviorCorrelations) {
                sections.push(`  - ${c.behavior}: ${c.delta > 0 ? '+' : ''}${c.delta}% next-day recovery (avg ${c.withRecovery}% with vs ${c.withoutRecovery}% without)`);
            }
        }

        if (ai.coachCompliance) {
            const cc = ai.coachCompliance;
            sections.push(`- Coach Compliance: ${cc.completed}/${cc.total} planned workouts completed (${cc.pct}%), ${cc.missed} missed`);
        }
    }

    // ── Today Context (daily morning briefing) ──────────────────────────────
    if (data.todayContext) {
        const tc = data.todayContext;

        // TODAY'S WHOOP DATA — insert at TOP of prompt so AI sees it first
        const hasWhoopToday = tc.todayRecovery != null || tc.todaySleepScore != null;
        const todayTopSections: string[] = [];
        if (hasWhoopToday) {
            todayTopSections.push(`\n## THIS MORNING'S WHOOP DATA (${tc.todayDayOfWeek}, ${tc.todayDate}) — USE THIS FOR READINESS`);
            todayTopSections.push(`CRITICAL: This is the CURRENT state of the body. Use THESE numbers for headline, readiness, and training decisions. Yesterday's biometrics below are HISTORY only.`);
            if (tc.todayRecovery != null) todayTopSections.push(`Recovery: ${tc.todayRecovery}% (${tc.todayRecovery >= 67 ? 'GREEN zone' : tc.todayRecovery >= 34 ? 'YELLOW zone' : 'RED zone'})`);
            if (tc.todaySleepScore != null) todayTopSections.push(`Last night's sleep score: ${tc.todaySleepScore}%`);
            if (tc.todaySleepHours != null) todayTopSections.push(`Last night's sleep hours: ${tc.todaySleepHours.toFixed(1)}h`);
            if (tc.todayHrv != null) todayTopSections.push(`HRV: ${tc.todayHrv.toFixed(0)}`);
            if (tc.todayRhr != null) todayTopSections.push(`RHR: ${tc.todayRhr}`);
            if (tc.todayDeepPct != null) todayTopSections.push(`Deep sleep: ${tc.todayDeepPct}% of total sleep`);
            if (tc.todayRemPct != null) todayTopSections.push(`REM sleep: ${tc.todayRemPct}% of total sleep`);
        } else {
            todayTopSections.push(`\n## TODAY (${tc.todayDayOfWeek}, ${tc.todayDate})`);
            todayTopSections.push(`Note: No biometric/WHOOP data available. Focus the headline and readiness sections on habits, projects, and tasks instead of recovery data.`);
        }
        // Insert today's data at the top, right after the period/cadence headers
        sections.splice(3, 0, ...todayTopSections);

        // TODAY'S PLAN (appended at the end as before)
        sections.push(`\n## TODAY'S PLAN`);
        if (tc.plannedWorkout) {
            sections.push(`Planned workout: ${tc.plannedWorkout}`);
        } else {
            sections.push(`No gym task scheduled — rest day or unplanned.`);
        }

        if (tc.todayCoachAdvice) {
            sections.push(`AI Coach advice: ${tc.todayCoachAdvice}`);
        }

        if (tc.todayHabits.length > 0) {
            sections.push(`Habits to complete: ${tc.todayHabits.join(', ')}`);
        }

        if (tc.activeProjects.length > 0) {
            sections.push(`\nActive projects:`);
            for (const p of tc.activeProjects) {
                const deadline = p.deadline ? ` (deadline: ${p.deadline})` : '';
                sections.push(`  - ${p.name}: ${p.tasksDone}/${p.tasksTotal} tasks done${deadline}`);
            }
        }

        if (tc.upcomingTasks.length > 0) {
            sections.push(`\nProject tasks in progress or to do:`);
            for (const t of tc.upcomingTasks) {
                const proj = t.projectName ? ` [${t.projectName}]` : '';
                const pri = t.priority ? ` (${t.priority})` : '';
                sections.push(`  - ${t.title}${proj} — ${t.status}${pri}`);
            }
        } else {
            sections.push(`\nNo active project tasks found.`);
        }
    }

    sections.push(`\n---\nGenerate the ${cadence} report JSON now based on the data above.`);

    return sections.join('\n');
}

// ─── Journal Prompts ─────────────────────────────────────────────────────────

export function buildJournalPromptsSystemPrompt(): string {
    return `You generate 3 personalized journal reflection questions based on the user's biometric data, habits, and workouts. The questions should encourage self-reflection and connect different aspects of their day.

Rules:
- Return a JSON array of exactly 3 strings — no wrapper object, just the array.
- Each question should be 1 sentence, conversational, and specific to the data provided.
- Reference actual metrics, habits, or workouts when relevant (e.g., "Your recovery was in the green zone today — what did you do differently yesterday?").
- Mix question types: one about physical/health, one about habits/productivity, one about mindset/gratitude.
- Do NOT ask generic questions like "How was your day?" — make them data-driven.
- Do NOT use emojis or special symbols.
- RESPOND WITH ONLY A VALID JSON ARRAY OF 3 STRINGS.

Example output:
["With recovery at 82%, what's one thing you want to push yourself on today?", "You've hit a 5-day meditation streak — how has that been affecting your focus?", "What's one thing you're grateful for this morning?"]`;
}

export function buildJournalPromptsUserPrompt(data: ReportDataPayload): string {
    const sections: string[] = [];

    // Biometrics summary (compact)
    const bm = data.biometrics;
    const recovery = bm.recovery.values.filter(v => v != null);
    const sleep = bm.sleep.values.filter(v => v != null);
    const strain = bm.strain.values.filter(v => v != null);
    const hrv = bm.hrv.values.filter(v => v != null);
    const sleepHours = bm.sleepHours.values.filter(v => v != null);

    if (recovery.length > 0) sections.push(`Recovery: ${recovery[0]}%`);
    if (sleep.length > 0) sections.push(`Sleep score: ${sleep[0]}%`);
    if (strain.length > 0) sections.push(`Strain: ${strain[0]}`);
    if (hrv.length > 0) sections.push(`HRV: ${hrv[0]}`);
    if (sleepHours.length > 0) sections.push(`Sleep hours: ${sleepHours[0]}`);

    // Habits
    if (data.habitDays.length > 0) {
        const day = data.habitDays[0];
        sections.push(`Habits completed: ${day.completed}/${day.total} (${day.completionRate}%)`);
        if (day.missed.length > 0) sections.push(`Missed habits: ${day.missed.join(', ')}`);
    }

    // Streaks
    if (data.habitStreaks.length > 0) {
        const notable = data.habitStreaks.filter(s => s.current >= 3).slice(0, 5);
        if (notable.length > 0) {
            sections.push(`Active streaks: ${notable.map(s => `${s.habit} (${s.current} days)`).join(', ')}`);
        }
    }

    // Workouts
    if (data.workouts.length > 0) {
        const w = data.workouts[0];
        sections.push(`Workout: ${w.sport} — Strain: ${w.strain ?? 'N/A'}, ${w.durationMinutes ?? '?'} min`);
    } else {
        sections.push(`No workout logged.`);
    }

    // Today context
    if (data.todayContext) {
        const tc = data.todayContext;
        if (tc.plannedWorkout) sections.push(`Planned today: ${tc.plannedWorkout}`);
        if (tc.todayHabits.length > 0) sections.push(`Today's habits: ${tc.todayHabits.join(', ')}`);
    }

    // Win / journal from daily summaries
    if (data.dailySummaries.length > 0) {
        const s = data.dailySummaries[0];
        if (s.win) sections.push(`Yesterday's win: ${s.win}`);
    }

    sections.push(`\nGenerate 3 personalized journal questions based on this data.`);

    return sections.join('\n');
}

// ─── Token estimation ────────────────────────────────────────────────────────

export function estimateTokens(systemPrompt: string, userPrompt: string): number {
    const totalChars = systemPrompt.length + userPrompt.length;
    return Math.ceil(totalChars / 4);
}
