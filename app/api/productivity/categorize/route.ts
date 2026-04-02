import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateCompletion } from '@/lib/llm';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { projectId } = await request.json();

        if (!projectId) {
            return NextResponse.json({ error: 'projectId required' }, { status: 400 });
        }

        const [sectionsRes, tasksRes] = await Promise.all([
            supabase.from('sections').select('*').eq('project_id', projectId),
            supabase.from('tasks')
                .select('*')
                .eq('project_id', projectId)
                .is('section_id', null)
        ]);

        if (sectionsRes.error || tasksRes.error) {
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        const sections = sectionsRes.data || [];
        const uncategorizedTasks = tasksRes.data || [];

        if (sections.length === 0 || uncategorizedTasks.length === 0) {
            return NextResponse.json({
                message: 'Nothing to categorize',
                categorized: 0
            });
        }

        const sectionNames = sections.map(s => s.name).join(', ');
        const taskList = uncategorizedTasks.map(t => `- ${t.id}: "${t.name}"`).join('\n');

        const prompt = `You are helping categorize tasks for a project management tool.

The project has these sections: ${sectionNames}

Here are tasks that need to be assigned to sections:
${taskList}

For each task, determine the BEST matching section based on the task name. If unsure, pick the closest match.

Respond ONLY with a JSON array where each object has:
- "taskId": the task id
- "sectionName": the exact section name to assign it to

Example response:
[{"taskId": "abc123", "sectionName": "Development"}, {"taskId": "def456", "sectionName": "Research"}]

JSON response:`;

        const responseText = await generateCompletion({
            provider: 'anthropic',
            model: 'claude-haiku-4-5-20251001',
            prompt,
            temperature: 0.2,
        });

        let assignments: { taskId: string; sectionName: string }[] = [];
        try {
            const jsonMatch = (typeof responseText === 'string' ? responseText : '').match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                assignments = JSON.parse(jsonMatch[0]);
            }
        } catch (parseErr) {
            console.error('Failed to parse AI response:', responseText);
            return NextResponse.json({ error: 'AI response parse error' }, { status: 500 });
        }

        const sectionMap = new Map(sections.map(s => [s.name.toLowerCase(), s.id]));

        let categorizedCount = 0;
        for (const assignment of assignments) {
            const sectionId = sectionMap.get(assignment.sectionName.toLowerCase());
            if (sectionId) {
                const { error } = await supabase
                    .from('tasks')
                    .update({ section_id: sectionId })
                    .eq('id', assignment.taskId);

                if (!error) {
                    categorizedCount++;
                }
            }
        }

        return NextResponse.json({
            message: `Categorized ${categorizedCount} tasks`,
            categorized: categorizedCount,
            assignments
        });

    } catch (error) {
        console.error('Categorize error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
