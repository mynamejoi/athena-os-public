import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

// Create a Supabase client with the Service Role key to bypass RLS for auto-calculations
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const yearStr = searchParams.get('year');

    if (!yearStr) {
        return NextResponse.json({ error: 'Year is required' }, { status: 400 });
    }

    const year = parseInt(yearStr);
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    try {
        // 1. Fetch Goals
        const { data: goals, error: goalsError } = await supabase
            .from('yearly_goals')
            .select('*')
            .eq('year', year)
            .order('created_at', { ascending: true });

        if (goalsError) throw goalsError;

        // 2. Fetch Data for Auto-Tracking
        // We only need to fetch data if there are goals that require it
        const hasBooksGoal = goals?.some(g => g.linked_metric === 'books_read');
        const hasGymGoal = goals?.some(g => g.linked_metric === 'gym_sessions');
        const hasProjectStreakGoal = goals?.some(g => g.linked_metric === 'project_streak');
        const hasRecoveryGoal = goals?.some(g => g.linked_metric === 'avg_recovery');
        const hasSleepGoal = goals?.some(g => g.linked_metric === 'avg_sleep');
        const hasStrainGoal = goals?.some(g => g.linked_metric === 'avg_strain');
        const hasPerfectDaysGoal = goals?.some(g => g.linked_metric === 'perfect_days');
        const hasWorkoutCountGoal = goals?.some(g => g.linked_metric === 'workout_count');

        let booksCount = 0;
        let workoutsCount = 0;
        let projectStreakCount = 0;
        let avgRecovery = 0;
        let avgSleep = 0;
        let avgStrain = 0;
        let perfectDaysCount = 0;
        let workoutTotalCount = 0;

        // Parallel fetch for simplified performance
        const promises = [];

        if (hasBooksGoal) {
            promises.push(
                supabase.from('books').select('*').or(`status.eq.Done,status.eq.In Progress`)
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (hasGymGoal) {
            promises.push(
                supabase.from('whoop_workouts').select('*').gte('date', startOfYear).lte('date', endOfYear).neq('sport_id', 0).neq('sport_id', -1)
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (hasProjectStreakGoal) {
            promises.push(
                supabase.from('tasks').select('completed_at').not('completed_at', 'is', null).gte('completed_at', startOfYear).lte('completed_at', endOfYear + 'T23:59:59.999Z')
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (hasRecoveryGoal || hasSleepGoal || hasStrainGoal) {
            promises.push(
                supabase.from('whoop_data').select('*').gte('date', startOfYear).lte('date', endOfYear)
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (hasPerfectDaysGoal) {
            promises.push(
                supabase.from('daily_tasks').select('date, status').gte('date', startOfYear).lte('date', endOfYear)
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        if (hasWorkoutCountGoal) {
            promises.push(
                supabase.from('whoop_workouts').select('id').gte('date', startOfYear).lte('date', endOfYear).neq('sport_id', 0).neq('sport_id', -1)
            );
        } else {
            promises.push(Promise.resolve({ data: [] }));
        }

        const [booksRes, workoutsRes, tasksRes, whoopRes, dailyTasksRes, workoutCountRes] = await Promise.all(promises);

        // --- Calculate Books ---
        if (hasBooksGoal && booksRes.data) {
            booksCount = booksRes.data.filter((b: any) => {
                if (b.status !== 'Done') return false;
                return b.year_finished === year.toString();
            }).length;
        }

        // --- Calculate Workouts ---
        if (hasGymGoal && workoutsRes.data) {
            const uniqueDays = new Set(workoutsRes.data.map((w: any) => w.date));
            workoutsCount = uniqueDays.size;
        }

        // --- Calculate Project Streak ---
        if (hasProjectStreakGoal && tasksRes.data) {
            const uniqueDays = new Set(tasksRes.data.map((t: any) => t.completed_at.split('T')[0]));
            projectStreakCount = uniqueDays.size;
        }

        // --- Calculate Perfect Days ---
        if (hasPerfectDaysGoal && dailyTasksRes.data) {
            const tasksByDate: Record<string, { completed: number, total: number }> = {};
            dailyTasksRes.data.forEach((t: any) => {
                if (!tasksByDate[t.date]) tasksByDate[t.date] = { completed: 0, total: 0 };
                tasksByDate[t.date].total++;
                if (t.status === 'Completed') tasksByDate[t.date].completed++;
            });
            perfectDaysCount = Object.values(tasksByDate).filter(d => d.total > 0 && d.completed === d.total).length;
        }

        // --- Calculate Workout Count (total rows, not unique days) ---
        if (hasWorkoutCountGoal && workoutCountRes.data) {
            workoutTotalCount = workoutCountRes.data.length;
        }

        // --- Calculate Averages ---
        if ((hasRecoveryGoal || hasSleepGoal || hasStrainGoal) && whoopRes.data) {
            const data = whoopRes.data;
            if (data.length > 0) {
                if (hasRecoveryGoal) {
                    const sum = data.reduce((acc: number, curr: any) => acc + (curr.recovery_score || 0), 0);
                    avgRecovery = Math.round(sum / (data.filter((d: any) => d.recovery_score).length || 1));
                }
                if (hasSleepGoal) {
                    const sum = data.reduce((acc: number, curr: any) => acc + (curr.sleep_performance || 0), 0);
                    avgSleep = Math.round(sum / (data.filter((d: any) => d.sleep_performance).length || 1));
                }
                if (hasStrainGoal) {
                    const sum = data.reduce((acc: number, curr: any) => acc + (curr.strain || 0), 0);
                    avgStrain = Number((sum / (data.filter((d: any) => d.strain).length || 1)).toFixed(1));
                }
            }
        }

        // 3. Update Goals with Calculated Values
        const updatedGoals = await Promise.all(goals!.map(async (goal) => {
            let newVal = goal.current_value;
            let needsUpdate = false;

            if (goal.linked_metric === 'books_read' && newVal !== booksCount) {
                newVal = booksCount;
                needsUpdate = true;
            } else if (goal.linked_metric === 'gym_sessions' && newVal !== workoutsCount) {
                newVal = workoutsCount;
                needsUpdate = true;
            } else if (goal.linked_metric === 'project_streak' && newVal !== projectStreakCount) {
                newVal = projectStreakCount;
                needsUpdate = true;
            } else if (goal.linked_metric === 'avg_recovery' && newVal !== avgRecovery) {
                newVal = avgRecovery;
                needsUpdate = true;
            } else if (goal.linked_metric === 'avg_sleep' && newVal !== avgSleep) {
                newVal = avgSleep;
                needsUpdate = true;
            } else if (goal.linked_metric === 'perfect_days' && newVal !== perfectDaysCount) {
                newVal = perfectDaysCount;
                needsUpdate = true;
            } else if (goal.linked_metric === 'workout_count' && newVal !== workoutTotalCount) {
                newVal = workoutTotalCount;
                needsUpdate = true;
            } else if (goal.linked_metric === 'avg_strain' && newVal !== avgStrain) {
                // Approximate float comparison
                if (Math.abs(newVal - avgStrain) > 0.1) {
                    newVal = avgStrain; // Note: schema stores integer currently?
                    // Schema: `current_value integer`.
                    // Problem: Strain is decimal (12.9). 
                    // Sol: Store as * 10? Or just round?
                    // User UI shows "12.9". 
                    // Let's store as scaled integer (x10) for Strain?
                    // Or change schema to float. 
                    // Current schema: integer.
                    // Goals usually whole numbers?
                    // For Strain, 12.9 is common.
                    // Decision: Store as Integer (Rounded), OR Update Schema to Numeric.
                    // Schema already created (script).
                    // I'll stick to formatting it in UI or store x10. 
                    // Let's just Round for now to avoid schema complexity, or store as x10.
                    // If I store x10, target need to be x10.
                    // Let's simpler: Store Strain as Integer (Round).
                    // Actually, "Avg Strain 12.9" goal? 
                    // Let's just round to nearest int for storage for now.
                    newVal = Math.round(avgStrain);
                    needsUpdate = true;
                }
            }

            if (goal.linked_metric !== 'none' && needsUpdate) {
                await supabase.from('yearly_goals').update({ current_value: newVal }).eq('id', goal.id);
                return { ...goal, current_value: newVal };
            }
            return goal;
        }));

        return NextResponse.json({ goals: updatedGoals });

    } catch (error: any) {
        console.error('Error fetching yearly goals:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { year, category, title, target_value, unit, linked_metric } = body;

        // Basic Validation
        if (!year || !category || !title) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Single User Mode (Matching other goal APIs)
        const user = { id: SINGLE_USER_ID };

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 401 });
        }

        const { data, error: insertError } = await supabase
            .from('yearly_goals')
            .insert({
                user_id: user.id,
                year,
                category,
                title,
                target_value,
                current_value: body.current_value ?? 0,
                unit,
                linked_metric,
                status: 'active'
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return NextResponse.json({ goal: data });

    } catch (error: any) {
        console.error('Error creating yearly goal:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
