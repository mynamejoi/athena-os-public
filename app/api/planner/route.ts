import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { anthropic } from '@/lib/claude';
import { SINGLE_USER_ID } from '@/lib/constants';
import { startOfWeek, format } from 'date-fns';
import { getETYesterday } from '@/lib/date-utils';

const MODEL = 'claude-haiku-4-5-20251001';

interface PlannerMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface PlannerTask {
    title: string;
    projectName: string;
    effort: 'quick' | 'short' | 'medium' | 'large';
    startDate: string;
    endDate: string | null;
    phase: string | null;
    section: string | null;
    description: string | null;
}

interface NewProject {
    name: string;
    description: string;
}

function getRecoveryZone(score: number | null, source: 'whoop' | 'habits' = 'whoop'): { zone: string; note: string } {
    if (score === null) return { zone: 'unknown', note: 'No recovery or habit data available' };
    const prefix = source === 'habits' ? '(Based on habit completion) ' : '';
    if (score >= 67) return { zone: 'green', note: `${prefix}High capacity — good day for demanding work` };
    if (score >= 34) return { zone: 'yellow', note: `${prefix}Moderate capacity — balance load carefully` };
    return { zone: 'red', note: `${prefix}Low capacity — keep it light, prioritize recovery` };
}

function getWeekStart(): string {
    const sunday = startOfWeek(new Date(), { weekStartsOn: 0 });
    return format(sunday, 'yyyy-MM-dd');
}

function buildSystemPrompt(context: {
    today: string;
    dayOfWeek: string;
    recoveryZone: string;
    recoveryNote: string;
    projects: Array<{ name: string; deadline: string | null; taskCount: number }>;
    activeTasks: Array<{ name: string; project: string; status: string; dueDate: string | null }>;
    books: Array<{ title: string; currentPage: number; totalPages: number }>;
    workoutPlan: string | null;
}): string {
    const projectLines = context.projects.length > 0
        ? context.projects.map(p =>
            `- ${p.name} (deadline: ${p.deadline || 'none'}, ${p.taskCount} tasks remaining)`
        ).join('\n')
        : '- No active projects';

    const taskLines = context.activeTasks.length > 0
        ? context.activeTasks.map(t =>
            `- ${t.name} [${t.project}] [${t.status}] [due: ${t.dueDate || 'none'}]`
        ).join('\n')
        : '- No active tasks';

    const bookLines = context.books.length > 0
        ? context.books.map(b =>
            `- ${b.title} — pg ${b.currentPage}/${b.totalPages}`
        ).join('\n')
        : '- No active books';

    const workoutSection = context.workoutPlan
        ? context.workoutPlan
        : '- No workout plan this week';

    return `You are Athena — a task planner inside a productivity platform. Be direct and decisive. Present ONE clean plan, not multiple drafts. If the user asks for changes, adjust and present the updated plan without showing your reasoning process.

You have context on the user's projects, tasks, books, workout plan, and recovery data.

TODAY: ${context.today} (${context.dayOfWeek})
RECOVERY ZONE: ${context.recoveryZone} — ${context.recoveryNote}

ACTIVE PROJECTS:
${projectLines}

EXISTING ACTIVE TASKS (to avoid duplicates):
${taskLines}

ACTIVE BOOKS:
${bookLines}

THIS WEEK'S WORKOUT PLAN:
${workoutSection}

RULES:
1. ALWAYS present a plan immediately — never ask clarifying questions about effort, dates, or details. Make your best estimate based on context and what the user said. If you're wrong, they'll tell you and you'll adjust. Do NOT ask "how long will X take?" or present multiple choice options.
2. Format your plan using this EXACT structure (dashes, pipe separators, project name as header):

Project Athena
  - Work on workout page | medium | Wed 3/18
  - Fix auth bug | short | Thu 3/19

Personal
  - Dentist appointment | quick | Fri 3/20

3. PROJECT NAME MATCHING (highest priority rule):
   - When the user says "project athena" or "for project athena", ALL tasks go under "Project Athena" — the EXACT name from ACTIVE PROJECTS.
   - NEVER assign tasks to a different project than what the user specified. If the user says "all tasks for Project Athena", every single task uses projectName: "Project Athena".
   - Project names in your output and JSON must EXACTLY match the names in ACTIVE PROJECTS above (case-sensitive).
   - Only assign to a different project if the user explicitly says so, or if no project is mentioned and the task clearly belongs elsewhere.

4. TASK BREAKDOWN RULES (critical):
   - Do NOT auto-break tasks into subtasks. Create tasks exactly as the user states them.
   - Only break tasks down when the user explicitly asks (e.g., "break this down", "split this up", "what are the subtasks").
   - When the user gives you a numbered list, create exactly that many tasks with those exact titles.

5. When the user DOES request a breakdown, use Section headers:

Project Athena
  Section: Rebuild Auth System (Mon 3/17 to Thu 3/20)
    - Audit current auth flow | short | Mon 3/17
    - Design new session management | medium | Tue 3/18

In the JSON, subtasks use section = parent task name, phase = null.

6. Effort levels and time estimates:
   - quick: <30 min (ALWAYS single day)
   - short: 30-60 min (ALWAYS single day)
   - medium: 1-3 hrs (single day, or 2-day range if complex)
   - large: 3+ hrs (MUST span 2-3+ days with start and end dates)

7. SCHEDULING RULES (critical):
   - If the user says "all for today" or "all due today", schedule ALL tasks on today's date. Do NOT spread them across multiple days. The user knows their capacity — respect their request even if recovery is red.
   - Otherwise: Maximum 1 large OR 2 medium tasks per day. Never stack large tasks on the same day.
   - Quick and short tasks can share a day with a medium task.
   - Large tasks MUST have a start AND end date spanning multiple days.
   - Medium tasks should have a specific day. If complex, give them a 2-day range.
   - Use any day of the week including weekends. The user works on weekends too.
   - Leave buffer days between demanding tasks for recovery.
   - If recovery is RED and the user hasn't specified dates, reduce daily load and add extra buffer days. But if the user specified dates, use their dates.
   - Each task line must show its date(s) in "Day MM/DD" format (e.g., "Mon 3/17" or "Mon 3/17 to Wed 3/19").

8. Consider the user's recovery zone when scheduling intensity.
9. If the user already has a task that matches, note it instead of duplicating.
10. End your response by asking if they want to adjust anything.
11. When the user confirms ("looks good", "create these", etc.), respond with ONLY this JSON (nothing else):

\`\`\`json
{"action":"create","newProjects":[],"tasks":[{"title":"string","projectName":"EXACT project name from plan above","effort":"quick|short|medium|large","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD or null","phase":null,"section":null,"description":null}]}
\`\`\`

CRITICAL: The projectName in EVERY task in the JSON MUST exactly match the project header you used in the plan text. If your plan showed tasks under "Project Athena", every task must have "projectName":"Project Athena" — not any other project name. The JSON must be consistent with the plan you presented.

12. Do NOT use emojis, special symbols, markdown bold, code fences, or brackets around project names. Plain text only. No asterisks around names.
13. Personal tasks (dentist, errands, life stuff) use projectName: "Personal".
14. Reading tasks should reference the actual book title and page count.
15. Keep the plan tight — the structure speaks for itself. No "Wait, let me fix that" or showing multiple drafts. Present ONE clean answer.
16. After showing the plan, ask ONE short question: "Want to adjust anything?" — nothing more.
17. When adjusting, show ONLY the UPDATED plan with changes applied. No reasoning, no "here's what I changed."
18. EVERY time you show a plan, recalculate the Phase date range from the tasks. Do not copy it from a previous response.
19. When the user says they're unavailable on a specific day, NEVER schedule any tasks on that day. Shift tasks around it.
20. When the user provides effort corrections (e.g., "that will take 3 days"), respect it exactly — update the effort level and date range to match.
21. If the user describes work that doesn't match any existing project, create a new project for it. Include it in the newProjects array in the JSON output.
22. Tasks have EITHER phase OR section, not both. Only use section when the user requested breakdown.`;
}

function extractTasksFromResponse(text: string): { tasks: PlannerTask[]; newProjects: NewProject[] } | null {
    // Look for JSON block with action: "create"
    const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (!jsonMatch) {
        // Also try raw JSON without code fences
        const rawMatch = text.match(/\{"action"\s*:\s*"create"[\s\S]*\}/);
        if (!rawMatch) return null;
        try {
            const parsed = JSON.parse(rawMatch[0]);
            if (parsed.action === 'create' && Array.isArray(parsed.tasks)) {
                return {
                    tasks: parsed.tasks,
                    newProjects: Array.isArray(parsed.newProjects) ? parsed.newProjects : [],
                };
            }
        } catch {
            return null;
        }
        return null;
    }

    try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.action === 'create' && Array.isArray(parsed.tasks)) {
            return {
                tasks: parsed.tasks,
                newProjects: Array.isArray(parsed.newProjects) ? parsed.newProjects : [],
            };
        }
    } catch {
        return null;
    }
    return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPlannerContext(supabase: any) {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const dayOfWeek = format(today, 'EEEE');
    const weekStart = getWeekStart();

    // Fetch all context in parallel
    const [
        projectsResult,
        sectionsResult,
        tasksResult,
        booksResult,
        whoopResult,
        workoutResult,
    ] = await Promise.all([
        supabase
            .from('projects')
            .select('id, name, deadline, status')
            .eq('user_id', SINGLE_USER_ID)
            .in('status', ['Active', 'In Progress']),
        supabase
            .from('sections')
            .select('id, name, project_id'),
        supabase
            .from('tasks')
            .select('name, status, project_id, start_date, due_date')
            .eq('user_id', SINGLE_USER_ID)
            .in('status', ['To Do', 'In Progress'])
            .order('created_at', { ascending: false })
            .limit(20),
        supabase
            .from('books')
            .select('title, current_page, total_pages')
            .eq('user_id', SINGLE_USER_ID)
            .eq('is_active', true),
        supabase
            .from('whoop_data')
            .select('recovery_score')
            .eq('user_id', SINGLE_USER_ID)
            .eq('date', todayStr)
            .maybeSingle(),
        supabase
            .from('workout_weekly_plans')
            .select('plan')
            .eq('user_id', SINGLE_USER_ID)
            .eq('week_start', weekStart)
            .maybeSingle(),
    ]);

    const projects = projectsResult.data || [];
    const sections = sectionsResult.data || [];
    const tasks = tasksResult.data || [];
    const books = booksResult.data || [];

    // Build project name lookup
    const projectNameMap = new Map<string, string>();
    for (const p of projects) {
        projectNameMap.set(p.id, p.name);
    }

    // Count remaining tasks per project
    const taskCountByProject = new Map<string, number>();
    for (const t of tasks) {
        const count = taskCountByProject.get(t.project_id) || 0;
        taskCountByProject.set(t.project_id, count + 1);
    }

    let recoveryScore = whoopResult.data?.recovery_score ?? null;
    let recoverySource: 'whoop' | 'habits' = 'whoop';

    // If no WHOOP recovery, compute zone from yesterday's habit completion
    if (recoveryScore == null) {
        const yesterdayStr = getETYesterday();

        const { data: yesterdayTasks } = await supabase
            .from('daily_tasks')
            .select('status')
            .eq('user_id', SINGLE_USER_ID)
            .eq('date', yesterdayStr)
            .eq('is_one_off', false);

        if (yesterdayTasks && yesterdayTasks.length > 0) {
            const completed = yesterdayTasks.filter((t: any) => t.status === 'Completed').length;
            const completionRate = (completed / yesterdayTasks.length) * 100;
            recoveryScore = completionRate;
            recoverySource = 'habits';
        }
    }

    const { zone, note } = getRecoveryZone(recoveryScore, recoverySource);

    // Format workout plan
    let workoutPlanStr: string | null = null;
    if (workoutResult.data?.plan) {
        const plan = workoutResult.data.plan;
        if (typeof plan === 'object' && plan !== null) {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const lines: string[] = [];
            for (const day of days) {
                const entry = (plan as Record<string, any>)[day];
                if (entry) {
                    const label = typeof entry === 'string' ? entry : (entry.label || entry.name || 'Planned');
                    lines.push(`- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${label}`);
                }
            }
            if (lines.length > 0) workoutPlanStr = lines.join('\n');
        }
    }

    return {
        today: todayStr,
        dayOfWeek,
        recoveryZone: zone,
        recoveryNote: note,
        projects: projects.map((p: any) => ({
            name: p.name,
            deadline: p.deadline,
            taskCount: taskCountByProject.get(p.id) || 0,
        })),
        activeTasks: tasks.map((t: any) => ({
            name: t.name,
            project: projectNameMap.get(t.project_id) || 'Unknown',
            status: t.status,
            dueDate: t.due_date,
        })),
        books: books.map((b: any) => ({
            title: b.title,
            currentPage: b.current_page || 0,
            totalPages: b.total_pages || 0,
        })),
        workoutPlan: workoutPlanStr,
        // Keep raw data for task creation
        _raw: { projects, sections },
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePlan(
    supabase: any,
    messages: PlannerMessage[]
) {
    const context = await fetchPlannerContext(supabase);
    const { _raw, ...promptContext } = context;
    const systemPrompt = buildSystemPrompt(promptContext);

    const anthropicMessages = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
    }));

    const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: anthropicMessages,
        temperature: 0.3,
    });

    const responseText = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

    // Check if the response contains a task creation JSON block
    const extracted = extractTasksFromResponse(responseText);

    // Post-process: fix project name mismatches between plan text and JSON
    // The AI sometimes shows the correct project in the plan but uses a different name in JSON
    if (extracted?.tasks && extracted.tasks.length > 0) {
        // Find the project name the user explicitly mentioned in the conversation
        const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
        const validProjectNames = context.projects.map((p: any) => p.name);

        // Check if user explicitly mentioned a project name
        let userRequestedProject: string | null = null;
        for (const msg of userMessages) {
            for (const projName of validProjectNames) {
                if (msg.includes(projName.toLowerCase())) {
                    userRequestedProject = projName;
                    break;
                }
            }
            if (userRequestedProject) break;
        }

        // Also extract project name from the plan text (the header line before tasks)
        // Look for lines that match a known project name in the assistant's previous responses
        const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content);
        let planProjectName: string | null = null;
        for (const msg of assistantMessages) {
            for (const projName of validProjectNames) {
                // Check if project name appears as a header line in the plan
                if (msg.includes(projName)) {
                    planProjectName = projName;
                    break;
                }
            }
            if (planProjectName) break;
        }

        // If user explicitly requested a project, override all task project names
        const correctProject = userRequestedProject || planProjectName;
        console.log('[Planner] Post-process: userRequestedProject =', userRequestedProject, 'planProjectName =', planProjectName, 'task projectNames =', extracted.tasks.map(t => t.projectName));
        if (correctProject) {
            for (const task of extracted.tasks) {
                const originalName = task.projectName;
                if (userRequestedProject) {
                    task.projectName = correctProject;
                } else if (!validProjectNames.some((p: string) => p.toLowerCase() === task.projectName.toLowerCase())) {
                    task.projectName = correctProject;
                }
                if (originalName !== task.projectName) {
                    console.log(`[Planner] Fixed project name: "${originalName}" -> "${task.projectName}"`);
                }
            }
        }
    }

    return NextResponse.json({
        response: responseText,
        tasks: extracted?.tasks || null,
        newProjects: extracted?.newProjects || null,
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(
    supabase: any,
    tasks: PlannerTask[],
    newProjects: NewProject[] = []
) {
    // Fetch projects and sections for matching
    const [projectsResult, sectionsResult] = await Promise.all([
        supabase
            .from('projects')
            .select('id, name, status')
            .in('status', ['active', 'Active', 'In Progress', 'in_progress']),
        supabase
            .from('sections')
            .select('id, name, project_id'),
    ]);

    const projects = projectsResult.data || [];
    const sections = sectionsResult.data || [];

    // Build lookup maps
    const projectByName = new Map<string, { id: string; name: string }>();
    for (const p of projects) {
        projectByName.set(p.name.toLowerCase(), { id: p.id, name: p.name });
    }

    const sectionsByProject = new Map<string, Array<{ id: string; name: string }>>();
    for (const s of sections) {
        const existing = sectionsByProject.get(s.project_id) || [];
        existing.push({ id: s.id, name: s.name });
        sectionsByProject.set(s.project_id, existing);
    }

    // Create new projects first
    if (newProjects && newProjects.length > 0) {
        for (const np of newProjects) {
            const { data, error: projError } = await supabase.from('projects').insert({
                user_id: SINGLE_USER_ID,
                name: np.name,
                overview: np.description || '',
                status: 'In Progress',
            }).select('id').single();
            if (projError) console.error('Planner: Failed to create project:', projError.message);

            if (data) {
                projectByName.set(np.name.toLowerCase(), { id: data.id, name: np.name });
            }
        }
    }

    let tasksCreated = 0;

    for (const task of tasks) {
        // Find project by name
        let projectId: string | null = null;
        const projectKey = task.projectName.toLowerCase();

        if (projectByName.has(projectKey)) {
            projectId = projectByName.get(projectKey)!.id;
        }

        // If "Personal" project doesn't exist, create it
        if (!projectId && projectKey === 'personal') {
            const { data: newProject } = await supabase
                .from('projects')
                .insert({
                    user_id: SINGLE_USER_ID,
                    name: 'Personal',
                    overview: 'Personal tasks and errands',
                    status: 'In Progress',
                })
                .select('id')
                .single();

            if (newProject) {
                projectId = newProject.id;
                projectByName.set('personal', { id: newProject.id, name: 'Personal' });
            }
        }

        if (!projectId) {
            // Skip tasks we can't match to a project
            console.warn(`Planner: Could not find project "${task.projectName}", skipping task "${task.title}"`);
            continue;
        }

        // Find or create section if phase or section is specified
        let sectionId: string | null = null;
        const sectionName = task.section || task.phase;
        if (sectionName) {
            const projectSections = sectionsByProject.get(projectId) || [];
            const matchingSection = projectSections.find(
                s => s.name.toLowerCase() === sectionName.toLowerCase()
            );

            if (matchingSection) {
                sectionId = matchingSection.id;
            } else {
                // Create the section
                const { data: newSection, error: secError } = await supabase
                    .from('sections')
                    .insert({
                        project_id: projectId,
                        name: sectionName,
                        order: projectSections.length,
                    })
                    .select('id')
                    .single();
                if (secError) console.error('Planner: Failed to create section:', secError.message);

                if (newSection) {
                    sectionId = newSection.id;
                    projectSections.push({ id: newSection.id, name: sectionName });
                    sectionsByProject.set(projectId, projectSections);
                }
            }
        }

        // Map effort to priority
        let priority: string;
        switch (task.effort) {
            case 'large': priority = 'High'; break;
            case 'medium': priority = 'Medium'; break;
            default: priority = 'Low'; break;
        }

        const { error } = await supabase.from('tasks').insert({
            user_id: SINGLE_USER_ID,
            name: task.title,
            description: task.description || '',
            status: 'To Do',
            priority,
            start_date: task.startDate,
            due_date: task.endDate || task.startDate,
            project_id: projectId,
            section_id: sectionId,
            is_brain_dump_item: true,
        });

        if (error) {
            console.error(`Planner: Failed to create task "${task.title}":`, error);
        } else {
            tasksCreated++;
        }
    }

    return NextResponse.json({ success: true, tasksCreated });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, action = 'plan', tasks, newProjects } = body as {
            messages?: PlannerMessage[];
            action?: 'plan' | 'create';
            tasks?: PlannerTask[];
            newProjects?: NewProject[];
        };

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        if (action === 'create') {
            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
                return NextResponse.json(
                    { error: 'Tasks array is required for create action' },
                    { status: 400 }
                );
            }
            return handleCreate(supabase, tasks, newProjects || []);
        }

        // Default: plan
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required for plan action' },
                { status: 400 }
            );
        }
        return handlePlan(supabase, messages);

    } catch (error) {
        console.error('Planner error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
