import { NextRequest, NextResponse } from 'next/server';
import { generateCompletion } from '@/lib/llm';

export async function POST(request: NextRequest) {
    try {
        const { task_title, start_date, end_date_hint, today } = await request.json();

        if (!task_title) {
            return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
        }

        const prompt = `You are a project planning assistant. Break down the following goal into a phased execution plan.

Rules:
1. Group tasks into 2-5 logical phases (Research, Design, Build, Test, etc.)
2. Order tasks by dependency — things that must happen first come first
3. Assign effort estimates:
   - quick: < 30 min
   - short: 30 min - 1 hr
   - medium: 1-3 hrs
   - large: 3+ hrs
4. Schedule realistically:
   - Start from the provided start date: ${start_date}
   - ~4-6 productive hours per day
   - Max 2 medium tasks or 1 large task per day
   - Dependent tasks start after their dependency ends
   - Skip weekends unless the task is personal/life
5. Task titles must be specific and actionable — start with a verb
6. Each task should be completable in a single work session
7. Generate comprehensive tasks appropriate for the scope.

Goal: ${task_title}
Start date: ${start_date}
End date hint: ${end_date_hint || 'None'}
Today: ${today}

Respond ONLY in JSON, no markdown:
{
  "summary": "Brief 1 sentence reasoning for the plan structure",
  "phases": [
    {
      "name": "Phase Name",
      "tasks": [
        {
          "title": "Actionable task title",
          "effort": "quick|short|medium|large",
          "start_date": "YYYY-MM-DD",
          "end_date": "YYYY-MM-DD or null",
          "description": "One line explaining what this involves"
        }
      ]
    }
  ]
}`;

        const responseText = await generateCompletion({
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251001',
            prompt,
            temperature: 0.2,
        });

        let parsedResult;
        try {
            const jsonMatch = (typeof responseText === 'string' ? responseText : '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch (e) {
            console.error("Failed to parse AI response:", responseText);
            throw new Error("Invalid format from AI");
        }

        return NextResponse.json(parsedResult);

    } catch (error) {
        console.error('Breakdown error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
