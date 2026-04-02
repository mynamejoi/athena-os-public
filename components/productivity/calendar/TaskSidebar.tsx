"use client";

import { useMemo } from 'react';
import { Task, Project, Section } from '@/types/productivity';
import { format, isToday, isTomorrow, isAfter, addDays, startOfDay, isSameDay } from 'date-fns';
import { CheckSquare, Lock, CheckCircle2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/date-utils';
import { PROJECT_COLORS } from '@/lib/colors';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TaskSidebarProps {
    tasks: Task[];
    projects: Project[];
    sections: Section[];
    onToggleTask: (task: Task) => void;
    onOpenTask?: (task: Task) => void;
}

export function TaskSidebar({ tasks, projects, sections, onToggleTask, onOpenTask }: TaskSidebarProps) {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const upcomingLimit = addDays(today, 14);

    const getProjectColor = (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        return project?.color || 'blue';
    };

    // parseLocalDate imported from @/lib/date-utils

    const groupedTasks = useMemo(() => {
        const todayTasks: Task[] = [];
        const tomorrowTasks: Task[] = [];
        const upcomingTasks: Task[] = [];

        tasks.forEach(task => {
            if (task.status === 'Done') return;

            // Need at least one date to place the task
            const dateSource = task.due_date || task.start_date;
            if (!dateSource) return;

            // Use due_date for feed placement (fallback to start_date)
            const feedDate = task.due_date ? parseLocalDate(task.due_date) : parseLocalDate(task.start_date!);

            // Show task only on its due date
            if (isSameDay(feedDate, today)) {
                todayTasks.push(task);
            }

            if (isSameDay(feedDate, tomorrow)) {
                tomorrowTasks.push(task);
            }

            // Upcoming: tasks due after tomorrow and within 14 days
            if (isAfter(feedDate, tomorrow) && feedDate <= upcomingLimit) {
                upcomingTasks.push(task);
            }
        });

        const upcomingByDate: Record<string, Task[]> = {};
        const getDateKey = (t: Task) => parseLocalDate(t.due_date || t.start_date!);
        upcomingTasks.sort((a, b) => getDateKey(a).getTime() - getDateKey(b).getTime())
            .forEach(task => {
                const dateKey = format(getDateKey(task), 'EEE, MMM d');
                if (!upcomingByDate[dateKey]) upcomingByDate[dateKey] = [];
                upcomingByDate[dateKey].push(task);
            });

        return { todayTasks, tomorrowTasks, upcomingByDate };
    }, [tasks]);

    const projectColorMap = PROJECT_COLORS;

    const handleQuickAdd = () => {
        const defaultProject = projects.find(p => p.name === 'Personal') || projects.find(p => p.name === 'Athena') || projects[0];
        const dateStr = format(today, 'yyyy-MM-dd');

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
        onOpenTask?.(draftTask);
    };

    const renderTaskItem = (task: Task) => {
        const project = projects.find(p => p.id === task.project_id);
        const color = project?.color || 'default';
        const dotColor = projectColorMap[color] || projectColorMap.default;

        return (
            <div
                key={task.id}
                className="group flex items-start gap-3 p-3 rounded-xl transition-colors cursor-pointer hover:brightness-125"
                style={{
                    backgroundColor: `${dotColor}15`,
                    borderLeft: `3px solid ${dotColor}`,
                }}
                onClick={() => onOpenTask?.(task)}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleTask(task); }}
                    className="mt-0.5 relative group shrink-0"
                >
                    {task.status === 'Done' ? (
                        <CheckCircle2 className="w-4 h-4 text-athena-gold" />
                    ) : (
                        <div className="w-4 h-4 rounded-full border border-white/20 group-hover:border-athena-gold transition-colors" />
                    )}
                </button>

                <div className="flex-1 min-w-0">
                    <span className={cn("text-xs font-semibold leading-relaxed break-words", task.status === 'Done' ? "line-through text-[#a3a3a3]" : "text-white/90")}>
                        {task.name}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="hidden md:flex flex-col h-full bg-[#0a0a0a] border-l border-white/10 w-full md:w-80 shrink-0">
            <div className="px-4 flex items-center justify-between border-b border-white/10 bg-[#0a0a0a] shrink-0" style={{ height: '56px', minHeight: '56px', boxSizing: 'border-box' }}>
                <h3 className="font-serif font-bold text-lg text-[#e5e5e5]">Task Feed</h3>
                <button
                    onClick={handleQuickAdd}
                    className="w-7 h-7 rounded-full flex items-center justify-center bg-athena-gold/20 text-athena-gold hover:bg-athena-gold/30 transition-colors border border-athena-gold/30"
                    title="Quick add task"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto p-4 space-y-8 custom-scrollbar">

                    {/* Today */}
                    <section>
                        <h4 className="text-xs font-bold text-athena-gold uppercase tracking-widest mb-3 flex items-center gap-2">
                            Today <span className="ml-auto text-white/20 font-normal">{format(today, 'MMM d')}</span>
                        </h4>
                        <div className="space-y-1">
                            {groupedTasks.todayTasks.length > 0 ? (
                                groupedTasks.todayTasks.map(renderTaskItem)
                            ) : (
                                <p className="text-sm text-muted-foreground italic px-2">No tasks for today</p>
                            )}
                        </div>
                    </section>

                    {/* Tomorrow */}
                    <section>
                        <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                            Tomorrow <span className="ml-auto text-white/20 font-normal">{format(tomorrow, 'MMM d')}</span>
                        </h4>
                        <div className="space-y-1">
                            {groupedTasks.tomorrowTasks.length > 0 ? (
                                groupedTasks.tomorrowTasks.map(renderTaskItem)
                            ) : (
                                <p className="text-sm text-muted-foreground italic px-2">No tasks for tomorrow</p>
                            )}
                        </div>
                    </section>

                    {/* Upcoming */}
                    <section>
                        <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-3">
                            Upcoming (14 Days)
                        </h4>
                        <div className="space-y-4">
                            {Object.entries(groupedTasks.upcomingByDate).length > 0 ? (
                                Object.entries(groupedTasks.upcomingByDate).map(([date, tasks]) => (
                                    <div key={date}>
                                        <h5 className="text-[10px] uppercase font-bold text-white/40 mb-2 pl-2 border-l-2 border-white/10">{date}</h5>
                                        <div className="space-y-1">
                                            {tasks.map(renderTaskItem)}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground italic px-2">No upcoming tasks</p>
                            )}
                        </div>
                    </section>

                    {/* Bottom spacer for fade-out gradient */}
                    <div className="h-8" />
                </div>

                {/* Fade-out gradient at bottom */}
                <div className="absolute bottom-0 inset-x-0 h-12 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, #0a0a0a)' }} />
            </div>
        </div>
    );
}
