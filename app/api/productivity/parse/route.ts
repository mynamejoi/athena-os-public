import { NextRequest, NextResponse } from 'next/server';
import { generateCompletion } from '@/lib/llm';

export async function POST(request: NextRequest) {
    try {
        const { text, projects = [], sections = [] } = await request.json();

        if (!text || !text.trim()) {
            return NextResponse.json({ tasks: [] });
        }

        const { toETDisplayDate } = await import('@/lib/date-utils');
        const today = toETDisplayDate();

        const projectList = projects.map((p: any) => `- ${p.name} (ID: ${p.id})`).join('\n');
        const sectionList = sections.map((s: any) => `- ${s.name} (ID: ${s.id}, ProjectID: ${s.project_id})`).join('\n');

        const prompt = `You are an expert AI productivity planner.

        Your Goal: Turn a raw "brain dump" of thoughts into a structured, realistic plan.

        Today's Date: ${today}

        Available Projects:
        ${projectList}

        Available Sections:
        ${sectionList}

        Input Text:
        "${text}"

        INSTRUCTIONS:
        1. **Parse & Clean**: Split text into distinct tasks. Clean up titles to be action-oriented (e.g., "call mom" -> "Call Mom").
        2. **Categorize**: Assign the BEST matching Project ID and Section ID. If personal/life, use "Personal" project key if available, or finding nearest match.
        3. **Estimate Effort**: Assign 'quick' (<30m), 'short' (30m-1h), 'medium' (1-3h), or 'large' (3h+).
        4. **Schedule**:
           - assigns start_date and end_date (YYYY-MM-DD).
           - Quick/Short tasks: Schedule for sooner (tomorrow/next day).
           - Large tasks: Schedule with more buffer.
           - If a specific date is mentioned (e.g. "Valentine's Day"), RESPECT it (Valentine's is Feb 14).
           - Do NOT schedule everything on the same day. Spread them out based on effort.
        5. **Reasoning**: Explain WHY you chose the date/category in 1 short sentence (e.g., "Urgent task with hard deadline").

        Return ONLY a JSON object with a "tasks" array.

        Schema:
        {
          "tasks": [
            {
              "title": string,
              "projectId": string | null,
              "sectionId": string | null,
              "effort": "quick" | "short" | "medium" | "large",
              "start_date": string, // YYYY-MM-DD
              "end_date": string | null, // YYYY-MM-DD
              "hard_deadline": string | null, // YYYY-MM-DD
              "reasoning": string
            }
          ]
        }
        `;

        const responseText = await generateCompletion({
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251001',
            prompt,
            temperature: 0.1,
        });

        let parsedResult = { tasks: [] as any[] };
        try {
            const jsonMatch = (typeof responseText === 'string' ? responseText : '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResult = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.error('Failed to parse AI response', responseText);
            const simpleTasks = text.split(/,|\n/).map((t: string) => ({
                title: t.trim(),
                effort: 'short',
                start_date: new Date().toISOString().split('T')[0],
                projectId: null,
                sectionId: null,
                reasoning: 'Fallback parsing'
            })).filter((t: any) => t.title.length > 0);
            parsedResult = { tasks: simpleTasks };
        }

        return NextResponse.json({ tasks: parsedResult.tasks || [] });

    } catch (error) {
        console.error('Parse error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
