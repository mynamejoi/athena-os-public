import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get('month'); // YYYY-MM-DD

    if (!monthStr) {
        return NextResponse.json({ error: 'Month parameter required' }, { status: 400 });
    }

    // Verify Env Vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use Service Role to bypass all RLS/Auth checks
    const supabase = createClient(supabaseUrl, serviceKey);

    // Single User Mode
    const user = { id: SINGLE_USER_ID };

    // Fix: Append time to prevent UTC-midnight shift to previous day/month
    const dateObj = new Date(monthStr.includes('T') ? monthStr : `${monthStr}T12:00:00`);
    const startDate = startOfMonth(dateObj);
    const endDate = endOfMonth(dateObj);
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd'); // 2026-02-28
    const endThimestampStr = endStr + 'T23:59:59.999Z';
    const yearNumber = dateObj.getFullYear();
    const monthIndex = dateObj.getMonth(); // 0 = Jan, 11 = Dec

    try {
        // 1. Fetch Goals
        const { data: monthlyGoals, error: monthlyError } = await supabase
            .from('monthly_goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('month', startStr);

        if (monthlyError) throw monthlyError;

        // 1b. Fetch active Yearly Goals to sync with Monthly
        const { data: yearlyGoals, error: yearlyError } = await supabase
            .from('yearly_goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('year', yearNumber)
            .eq('status', 'active');

        if (yearlyError) throw yearlyError;

        let finalGoals = [...monthlyGoals];

        // 1c. Sync Yearly Goals into Monthly Goals
        // Only recalculate targets for the current or future months — past months are frozen.
        const today = new Date();
        const isCurrentOrFutureMonth = yearNumber > today.getFullYear() ||
            (yearNumber === today.getFullYear() && monthIndex >= today.getMonth());

        if (yearlyGoals && yearlyGoals.length > 0 && isCurrentOrFutureMonth) {
            // Fetch ALL monthly goals for this year to compute prior progress accurately
            const { data: allYearMonthlyGoals } = await supabase
                .from('monthly_goals')
                .select('yearly_goal_id, current_value, month')
                .eq('user_id', user.id)
                .gte('month', `${yearNumber}-01-01`)
                .lte('month', `${yearNumber}-12-01`);

            for (const yg of yearlyGoals) {
                const existingMonthGoal = finalGoals.find(mg => mg.yearly_goal_id === yg.id);

                // Sum progress from all OTHER months' linked goals (not this month)
                const priorProgress = (allYearMonthlyGoals || [])
                    .filter(mg => mg.yearly_goal_id === yg.id && mg.month !== startStr)
                    .reduce((sum, mg) => sum + (mg.current_value || 0), 0);

                // Months remaining including this one
                const remainingMonths = Math.max(12 - monthIndex, 1);
                const remainingTarget = yg.target_value - priorProgress;

                let calculatedMonthTarget = remainingTarget > 0
                    ? Math.ceil(remainingTarget / remainingMonths)
                    : 0;

                if (calculatedMonthTarget < 1 && remainingTarget > 0) {
                    calculatedMonthTarget = 1;
                }

                if (calculatedMonthTarget > 0) {
                    if (existingMonthGoal) {
                        if (existingMonthGoal.target_value !== calculatedMonthTarget) {
                            await supabase
                                .from('monthly_goals')
                                .update({ target_value: calculatedMonthTarget })
                                .eq('id', existingMonthGoal.id);
                            existingMonthGoal.target_value = calculatedMonthTarget;
                        }
                    } else {
                        const newGoal = {
                            user_id: user.id,
                            month: startStr,
                            category: yg.category,
                            title: yg.title,
                            target_value: calculatedMonthTarget,
                            current_value: 0,
                            unit: yg.unit,
                            linked_metric: yg.linked_metric,
                            status: 'active',
                            yearly_goal_id: yg.id
                        };

                        const { data: insertedGoal, error: insertError } = await supabase
                            .from('monthly_goals')
                            .insert(newGoal)
                            .select()
                            .single();

                        if (!insertError && insertedGoal) {
                            finalGoals.push(insertedGoal);
                        }
                    }
                }
            }
        } else if (yearlyGoals && yearlyGoals.length > 0 && !isCurrentOrFutureMonth) {
            // Past month: just auto-create if missing (with a simple even split), but don't update existing targets
            for (const yg of yearlyGoals) {
                const existingMonthGoal = finalGoals.find(mg => mg.yearly_goal_id === yg.id);
                if (!existingMonthGoal) {
                    const evenTarget = Math.ceil(yg.target_value / 12);
                    const newGoal = {
                        user_id: user.id,
                        month: startStr,
                        category: yg.category,
                        title: yg.title,
                        target_value: evenTarget,
                        current_value: 0,
                        unit: yg.unit,
                        linked_metric: yg.linked_metric,
                        status: 'active',
                        yearly_goal_id: yg.id
                    };
                    const { data: insertedGoal, error: insertError } = await supabase
                        .from('monthly_goals')
                        .insert(newGoal)
                        .select()
                        .single();
                    if (!insertError && insertedGoal) {
                        finalGoals.push(insertedGoal);
                    }
                }
            }
        }

        // 2. Auto-Update Progress for Linked Goals
        const updatedGoals = await Promise.all(finalGoals.map(async (goal) => {
            if (goal.linked_metric === 'none' || goal.status === 'archived') return goal;

            let calculatedValue = goal.current_value;

            if (goal.linked_metric === 'perfect_days') {
                const { data: dailyTasks } = await supabase
                    .from('daily_tasks')
                    .select('date, status')
                    .gte('date', startStr)
                    .lte('date', endStr);

                if (dailyTasks) {
                    const tasksByDate: Record<string, { completed: number, total: number }> = {};
                    dailyTasks.forEach((t: any) => {
                        if (!tasksByDate[t.date]) tasksByDate[t.date] = { completed: 0, total: 0 };
                        tasksByDate[t.date].total++;
                        if (t.status === 'Completed') tasksByDate[t.date].completed++;
                    });
                    calculatedValue = Object.values(tasksByDate).filter(d => d.total > 0 && d.completed === d.total).length;
                }
            }
            else if (goal.linked_metric === 'workout_count') {
                const { data: workouts } = await supabase
                    .from('whoop_workouts')
                    .select('id')
                    .gte('date', startStr)
                    .lte('date', endStr)
                    .neq('sport_id', 0)
                    .neq('sport_id', -1);

                if (workouts) {
                    calculatedValue = workouts.length;
                }
            }
            else if (goal.linked_metric === 'avg_recovery' || goal.linked_metric === 'avg_sleep' || goal.linked_metric === 'avg_strain') {
                const { data: whoopData } = await supabase
                    .from('whoop_data')
                    .select('recovery_score, sleep_performance, strain')
                    .gte('date', startStr)
                    .lte('date', endStr);

                if (whoopData && whoopData.length > 0) {
                    if (goal.linked_metric === 'avg_recovery') {
                        const valid = whoopData.filter((d: any) => d.recovery_score);
                        calculatedValue = valid.length > 0 ? Math.round(valid.reduce((acc: number, d: any) => acc + d.recovery_score, 0) / valid.length) : 0;
                    } else if (goal.linked_metric === 'avg_sleep') {
                        const valid = whoopData.filter((d: any) => d.sleep_performance);
                        calculatedValue = valid.length > 0 ? Math.round(valid.reduce((acc: number, d: any) => acc + d.sleep_performance, 0) / valid.length) : 0;
                    } else if (goal.linked_metric === 'avg_strain') {
                        const valid = whoopData.filter((d: any) => d.strain);
                        calculatedValue = valid.length > 0 ? Math.round(valid.reduce((acc: number, d: any) => acc + d.strain, 0) / valid.length) : 0;
                    }
                }
            }
            else if (goal.linked_metric === 'gym_sessions') {
                const { data: workouts } = await supabase
                    .from('whoop_workouts')
                    .select('date')
                    .eq('user_id', user.id)
                    .gte('date', startStr)
                    .lte('date', endStr)
                    .neq('sport_id', 0) // Exclude generic 'Activity'
                    .neq('sport_id', -1); // Exclude 'General Activity'

                if (workouts) {
                    const uniqueDays = new Set(workouts.map(w => w.date));
                    calculatedValue = uniqueDays.size;
                }
            }
            else if (goal.linked_metric === 'books_read') {
                // 1. Completed Books Count
                const { count: completedCount } = await supabase
                    .from('books')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('status', 'Done')
                    .eq('year_finished', yearNumber.toString())
                    .gte('updated_at', startStr)
                    .lte('updated_at', endThimestampStr);

                calculatedValue = completedCount || 0;
            }
            else if (goal.linked_metric === 'project_streak') {
                // Count distinct days with completed tasks
                const { data: tasks } = await supabase
                    .from('tasks')
                    .select('completed_at')
                    // .eq('user_id', user.id) // Bypassing user check due to anon tasks
                    .not('completed_at', 'is', null)
                    .gte('completed_at', startStr)
                    .lte('completed_at', endThimestampStr);

                if (tasks) {
                    const uniqueDays = new Set(tasks.map((t: any) => t.completed_at.split('T')[0]));
                    calculatedValue = uniqueDays.size;
                }
            }

            // If value changed, update DB
            if (calculatedValue !== goal.current_value) {
                await supabase
                    .from('monthly_goals')
                    .update({ current_value: calculatedValue })
                    .eq('id', goal.id);
                return { ...goal, current_value: calculatedValue };
            }

            return goal;
        }));

        return NextResponse.json({ goals: updatedGoals });

    } catch (error) {
        console.error('Error fetching goals:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    // Verify Env Vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use Service Role to bypass all RLS/Auth checks
    const supabase = createClient(supabaseUrl, serviceKey);

    // Single User Mode
    const user = { id: SINGLE_USER_ID };

    try {
        const body = await request.json();
        const { month, category, title, target_value, current_value, unit, linked_metric } = body;

        const { data, error } = await supabase
            .from('monthly_goals')
            .insert({
                user_id: user.id,
                month: month, // Assumes client sends YYYY-MM-01 correctly formatted
                category,
                title,
                target_value,
                current_value: current_value ?? 0,
                unit,
                linked_metric,
                status: 'active'
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ goal: data });

    } catch (error) {
        console.error('Error creating goal:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
