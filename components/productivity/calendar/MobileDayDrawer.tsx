"use client";

import { useMemo } from 'react';
import { Task, Project } from '@/types/productivity';
import { format, isSameDay, isToday, isBefore, startOfDay } from 'date-fns';
import { CheckCircle2, Plus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/date-utils';
import { PROJECT_COLORS } from '@/lib/colors';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';

interface MobileDayDrawerProps {
    open: boolean;
    onClose: () => void;
    date: Date | null;
    tasks: Task[];
    projects: Project[];
    onToggleTask: (task: Task) => void;
    onOpenTask: (task: Task) => void;
    onNewTask: (date: Date) => void;
}

export function MobileDayDrawer({ open, onClose, date, tasks, projects, onToggleTask, onOpenTask, onNewTask }: MobileDayDrawerProps) {
    const projectColorMap = PROJECT_COLORS;
    const today = startOfDay(new Date());

    const dayTasks = useMemo(() => {
        if (!date) return [];
        return tasks.filter(task => {
            const taskStart = task.start_date ? parseLocalDate(task.start_date) : null;
            const taskEnd = task.due_date ? parseLocalDate(task.due_date) : null;
            const effectiveStart = taskStart || taskEnd;
            const effectiveEnd = taskEnd || taskStart;
            if (!effectiveStart || !effectiveEnd) return false;
            return date >= effectiveStart && date <= effectiveEnd;
        }).sort((a, b) => {
            // Active tasks first, then done
            if (a.status !== b.status) return a.status === 'Done' ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [date, tasks]);

    const activeTasks = dayTasks.filter(t => t.status !== 'Done');
    const doneTasks = dayTasks.filter(t => t.status === 'Done');

    if (!date) return null;

    const isOverdue = (task: Task): boolean => {
        if (task.status === 'Done') return false;
        const dueDate = task.due_date ? parseLocalDate(task.due_date) : null;
        if (!dueDate) return false;
        return isBefore(dueDate, today) && !isSameDay(dueDate, today);
    };

    return (
        <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DrawerContent className="bg-[#0a0a0a] border-white/10 max-h-[85dvh]">
                <DrawerHeader className="pb-2 pt-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <DrawerTitle className="font-serif text-left text-lg text-[#e5e5e5]">
                                {isToday(date) ? 'Today' : format(date, 'EEEE')}
                            </DrawerTitle>
                            <p className="text-xs text-white/40 text-left mt-0.5">
                                {format(date, 'MMMM d, yyyy')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-white/30">
                                {dayTasks.length} task{dayTasks.length !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => { onClose(); onNewTask(date); }}
                                className="w-9 h-9 rounded-full flex items-center justify-center bg-athena-gold/20 text-athena-gold active:bg-athena-gold/30 transition-colors border border-athena-gold/30"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </DrawerHeader>

                <div className="px-4 pb-8 overflow-y-auto flex-1 min-h-0">
                    {dayTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                <Plus className="w-5 h-5 text-white/20" />
                            </div>
                            <p className="text-sm text-white/40">No tasks for this day</p>
                            <button
                                onClick={() => { onClose(); onNewTask(date); }}
                                className="mt-3 text-xs text-athena-gold font-medium active:opacity-70"
                            >
                                Add a task
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {/* Active tasks */}
                            {activeTasks.map(task => {
                                const project = projects.find(p => p.id === task.project_id);
                                const color = project?.color || 'default';
                                const dotColor = projectColorMap[color] || projectColorMap.default;
                                const overdue = isOverdue(task);

                                return (
                                    <div
                                        key={task.id}
                                        className="flex items-center gap-3 p-3 rounded-xl active:scale-[0.98] transition-all"
                                        style={{
                                            backgroundColor: `${dotColor}12`,
                                            borderLeft: `3px solid ${dotColor}`,
                                        }}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onToggleTask(task); }}
                                            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-white/15 active:bg-athena-gold/20 transition-colors"
                                        >
                                            <div className="w-4 h-4 rounded-full border-2 border-white/25" />
                                        </button>

                                        <div
                                            className="flex-1 min-w-0 cursor-pointer"
                                            onClick={() => { onClose(); onOpenTask(task); }}
                                        >
                                            <p className="text-sm font-medium text-white/90 truncate">
                                                {task.name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {project && (
                                                    <span className="text-[10px] font-medium" style={{ color: `${dotColor}99` }}>
                                                        {project.name}
                                                    </span>
                                                )}
                                                {overdue && (
                                                    <span className="text-[10px] text-red-400 font-medium">
                                                        Overdue
                                                    </span>
                                                )}
                                                {task.due_date && !isSameDay(parseLocalDate(task.due_date), date) && (
                                                    <span className="text-[10px] text-white/30">
                                                        Due {format(parseLocalDate(task.due_date), 'MMM d')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <ChevronRight className="w-4 h-4 text-white/15 shrink-0" />
                                    </div>
                                );
                            })}

                            {/* Completed tasks */}
                            {doneTasks.length > 0 && (
                                <>
                                    {activeTasks.length > 0 && (
                                        <div className="flex items-center gap-2 pt-3 pb-1 px-1">
                                            <div className="h-px flex-1 bg-white/5" />
                                            <span className="text-[10px] text-white/25 uppercase tracking-wider font-medium">Completed</span>
                                            <div className="h-px flex-1 bg-white/5" />
                                        </div>
                                    )}
                                    {doneTasks.map(task => {
                                        const project = projects.find(p => p.id === task.project_id);
                                        const color = project?.color || 'default';
                                        const dotColor = projectColorMap[color] || projectColorMap.default;

                                        return (
                                            <div
                                                key={task.id}
                                                className="flex items-center gap-3 p-3 rounded-xl opacity-50"
                                                style={{
                                                    backgroundColor: `${dotColor}08`,
                                                    borderLeft: `3px solid ${dotColor}40`,
                                                }}
                                            >
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onToggleTask(task); }}
                                                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-athena-gold/10 active:bg-athena-gold/20 transition-colors"
                                                >
                                                    <CheckCircle2 className="w-4 h-4 text-athena-gold" />
                                                </button>

                                                <div
                                                    className="flex-1 min-w-0 cursor-pointer"
                                                    onClick={() => { onClose(); onOpenTask(task); }}
                                                >
                                                    <p className="text-sm font-medium text-white/50 line-through truncate">
                                                        {task.name}
                                                    </p>
                                                    {project && (
                                                        <span className="text-[10px]" style={{ color: `${dotColor}60` }}>
                                                            {project.name}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
