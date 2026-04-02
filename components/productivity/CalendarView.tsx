"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TaskSidebar } from './calendar/TaskSidebar';
import { MainCalendar } from './calendar/MainCalendar';
import { Task, Project, Section } from '@/types/productivity';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { TaskQuickEdit } from './calendar/TaskQuickEdit';
import { MobileDayDrawer } from './calendar/MobileDayDrawer';
import { MobileTaskEditor } from './calendar/MobileTaskEditor';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { useIsMobile } from '@/hooks/use-mobile';

export function CalendarView() {
    const supabase = createClient();
    const { whoopEnabled } = useWhoopMode();
    const isMobile = useIsMobile();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [dailyHabits, setDailyHabits] = useState<any[]>([]);
    const [recoveryByDate, setRecoveryByDate] = useState<Record<string, number>>({});
    const [mobileDayDrawerDate, setMobileDayDrawerDate] = useState<Date | null>(null);

    const habitsByDate = useMemo(() => {
        const map: Record<string, { total: number; completed: number }> = {};
        dailyHabits.forEach(h => {
            if (!map[h.date]) map[h.date] = { total: 0, completed: 0 };
            map[h.date].total++;
            if (h.status === 'Completed') map[h.date].completed++;
        });
        return map;
    }, [dailyHabits]);

    const fetchTasks = useCallback(async (month: Date) => {
        const windowStart = format(startOfMonth(subMonths(month, 1)), 'yyyy-MM-dd');
        const windowEnd = format(endOfMonth(addMonths(month, 1)), 'yyyy-MM-dd');

        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .or(`due_date.gte.${windowStart},start_date.gte.${windowStart}`)
            .or(`start_date.lte.${windowEnd},due_date.lte.${windowEnd}`);

        if (error) console.error(error);
        setTasks((data as unknown as Task[]) || []);
    }, []);

    const fetchStaticData = useCallback(async () => {
        const [projectsRes, sectionsRes] = await Promise.all([
            supabase.from('projects').select('*'),
            supabase.from('sections').select('*')
        ]);

        if (projectsRes.error) console.error(projectsRes.error);
        if (sectionsRes.error) console.error(sectionsRes.error);

        setProjects((projectsRes.data as unknown as Project[]) || []);
        setSections((sectionsRes.data as unknown as Section[]) || []);
    }, []);

    const fetchHabitsAndRecovery = useCallback(async (month: Date) => {
        const startStr = format(startOfMonth(subMonths(month, 1)), 'yyyy-MM-dd');
        const endStr = format(endOfMonth(addMonths(month, 1)), 'yyyy-MM-dd');

        const habitsPromise = supabase
            .from('daily_tasks')
            .select('date, title, status, is_one_off')
            .gte('date', startStr)
            .lte('date', endStr)
            .eq('is_one_off', false);

        const whoopPromise = whoopEnabled
            ? supabase
                .from('whoop_data')
                .select('date, recovery_score')
                .gte('date', startStr)
                .lte('date', endStr)
            : Promise.resolve({ data: null, error: null });

        const [habitsRes, whoopRes] = await Promise.all([habitsPromise, whoopPromise]);

        if (habitsRes.error) console.error(habitsRes.error);
        setDailyHabits(habitsRes.data || []);

        if (whoopRes.error) console.error(whoopRes.error);
        const recoveryMap: Record<string, number> = {};
        (whoopRes.data || []).forEach((w: any) => {
            if (w.recovery_score != null) recoveryMap[w.date] = w.recovery_score;
        });
        setRecoveryByDate(recoveryMap);
    }, [whoopEnabled]);

    const fetchData = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        await Promise.all([fetchTasks(currentMonth), fetchStaticData(), fetchHabitsAndRecovery(currentMonth)]);
        setLoading(false);
    };

    useEffect(() => {
        fetchStaticData();
    }, []);

    useEffect(() => {
        Promise.all([fetchTasks(currentMonth), fetchHabitsAndRecovery(currentMonth)]).then(() => setLoading(false));
    }, [currentMonth]);

    const handleMonthChange = useCallback((month: Date) => {
        setCurrentMonth(month);
    }, []);

    const handleToggleTask = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        const completedAt = newStatus === 'Done' ? new Date().toISOString() : null;

        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed_at: completedAt } : t));

        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus, completed_at: completedAt })
            .eq('id', task.id);

        if (error) {
            toast.error('Failed to update task');
            fetchData();
        }
    };

    const handleUpdateTaskDate = async (taskId: string, newDate: Date, preserveDuration?: boolean) => {
        const dateStr = format(newDate, 'yyyy-MM-dd');
        const task = tasks.find(t => t.id === taskId);

        let updates: { due_date: string; start_date?: string } = {
            due_date: dateStr,
            start_date: (task?.start_date && !preserveDuration) ? dateStr : undefined
        };

        // For multi-day tasks, preserve the duration by shifting both dates
        if (preserveDuration && task?.start_date && task?.due_date) {
            const startDate = parseLocalDate(task.start_date);
            const endDate = parseLocalDate(task.due_date);
            const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const newEndDate = new Date(newDate);
            newEndDate.setDate(newEndDate.getDate() + duration);
            updates = {
                start_date: dateStr,
                due_date: format(newEndDate, 'yyyy-MM-dd')
            };
        }

        // Optimistic update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));

        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', taskId);

        if (error) {
            toast.error('Failed to reschedule task');
            fetchData();
        } else {
            toast.success(`Rescheduled to ${format(newDate, 'MMM d')}`);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) {
            toast.error('Failed to delete task');
            fetchData();
        } else {
            toast.success('Task deleted');
        }
    };

    const handleDayClick = (date: Date) => {
        if (isMobile) {
            // On mobile, open the day detail drawer instead of immediately creating a task
            setMobileDayDrawerDate(date);
            return;
        }
        openNewTaskDraft(date);
    };

    const openNewTaskDraft = (date: Date) => {
        const defaultProject = projects.find(p => p.name === 'Personal') || projects.find(p => p.name === 'Athena') || projects[0];
        const dateStr = format(date, 'yyyy-MM-dd');

        const draftTask: Task = {
            id: 'new',
            name: '',
            description: '',
            status: 'To Do',
            priority: 'Medium',
            start_date: dateStr,
            due_date: dateStr,
            project_id: defaultProject?.id || '',
            created_at: new Date().toISOString(),
        } as Task;
        setSelectedTask(draftTask);
    };

    const handleTaskCreated = (newTask: Task) => {
        setTasks(prev => [...prev, newTask]);
        setSelectedTask(newTask);
        toast.success('Task created');
    };

    const handleDraftChange = (updatedTask: Task) => {
        setSelectedTask(updatedTask);
    };

    if (loading) {
        return (
            <div className="h-[calc(100vh-200px)] w-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col space-y-0 md:space-y-6">

            <div
                className="w-full flex flex-col md:flex-row border rounded-xl overflow-hidden bg-[#0a0a0a] border-white/10 shadow-2xl h-[calc(100dvh-130px)] md:h-[calc(100vh-180px)]"
            >
                <MainCalendar
                    tasks={tasks}
                    projects={projects}
                    onToggleTask={handleToggleTask}
                    onUpdateTaskDate={handleUpdateTaskDate}
                    onOpenTask={setSelectedTask}
                    onDayClick={handleDayClick}
                    onMonthChange={handleMonthChange}
                    habitsByDate={habitsByDate}
                    recoveryByDate={recoveryByDate}
                    whoopEnabled={whoopEnabled}
                />
                <div className="hidden md:block">
                    <TaskSidebar
                        tasks={tasks}
                        projects={projects}
                        sections={sections}
                        onToggleTask={handleToggleTask}
                        onOpenTask={setSelectedTask}
                    />
                </div>

                {/* Desktop: Task Quick Edit Dialog */}
                {!isMobile && (
                    <TaskQuickEdit
                        task={selectedTask}
                        open={!!selectedTask}
                        onClose={() => setSelectedTask(null)}
                        projects={projects}
                        sections={sections}
                        onUpdate={fetchData}
                        onDelete={handleDeleteTask}
                        onCreate={handleTaskCreated}
                        onDraftChange={handleDraftChange}
                    />
                )}
            </div>

            {/* Mobile: Day Detail Drawer */}
            {isMobile && (
                <MobileDayDrawer
                    open={!!mobileDayDrawerDate}
                    onClose={() => setMobileDayDrawerDate(null)}
                    date={mobileDayDrawerDate}
                    tasks={tasks}
                    projects={projects}
                    onToggleTask={handleToggleTask}
                    onOpenTask={(task) => { setMobileDayDrawerDate(null); setSelectedTask(task); }}
                    onNewTask={(date) => { setMobileDayDrawerDate(null); openNewTaskDraft(date); }}
                />
            )}

            {/* Mobile: Task Editor Drawer */}
            {isMobile && (
                <MobileTaskEditor
                    task={selectedTask}
                    open={!!selectedTask}
                    onClose={() => setSelectedTask(null)}
                    projects={projects}
                    sections={sections}
                    onUpdate={fetchData}
                    onDelete={handleDeleteTask}
                    onCreate={handleTaskCreated}
                    onDraftChange={handleDraftChange}
                />
            )}
        </div>
    );
}
