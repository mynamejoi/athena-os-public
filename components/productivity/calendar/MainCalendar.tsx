"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Task, Project } from '@/types/productivity';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, startOfWeek, endOfWeek, isSameMonth, differenceInDays, addDays, isBefore, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/date-utils';
import { PROJECT_COLORS } from '@/lib/colors';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useKeyboardShortcuts } from '@/lib/useKeyboardShortcuts';
import { useIsMobile } from '@/hooks/use-mobile';

interface MainCalendarProps {
    tasks: Task[];
    projects: Project[];
    onToggleTask: (task: Task) => void;
    onUpdateTaskDate: (taskId: string, newDate: Date, preserveDuration?: boolean) => void;
    onOpenTask?: (task: Task) => void;
    onDayClick?: (date: Date) => void;
    onMonthChange?: (date: Date) => void;
    habitsByDate?: Record<string, { total: number; completed: number }>;
    recoveryByDate?: Record<string, number>;
    whoopEnabled?: boolean;
}

const DRAG_THRESHOLD = 5;
const MAX_VISIBLE_LANES_SM = 2;
const MAX_VISIBLE_LANES_LG = 3;

// Assign lanes at the week level so multi-day tasks stay consistent
interface LaneEntry {
    task: Task;
    lane: number;
    startCol: number; // 0-6 column within this week
    endCol: number;   // 0-6 column within this week
}

// Helper: get background tint based on task count
function getTaskCountTint(count: number): string | undefined {
    if (count >= 5) return 'rgba(212,175,55,0.06)';
    if (count >= 3) return 'rgba(212,175,55,0.04)';
    if (count >= 1) return 'rgba(212,175,55,0.02)';
    return undefined;
}

// Helper: get recovery tint color
function getRecoveryTint(recovery: number): string {
    if (recovery >= 67) return 'rgba(34,197,94,0.03)';
    if (recovery >= 34) return 'rgba(234,179,8,0.03)';
    return 'rgba(239,68,68,0.03)';
}

// Helper: get capacity bar color
function getCapacityBarColor(count: number): string {
    if (count >= 5) return 'rgba(249,115,22,0.7)'; // orange
    if (count >= 3) return 'rgba(212,175,55,0.6)'; // brighter gold
    return 'rgba(212,175,55,0.35)'; // subtle gold
}

// Helper: get habit dot color
function getHabitDotColor(total: number, completed: number): string {
    if (total === 0) return 'transparent';
    const ratio = completed / total;
    if (ratio >= 1) return 'rgba(34,197,94,0.9)'; // green
    if (ratio > 0.5) return 'rgba(212,175,55,0.8)'; // gold
    return 'rgba(255,255,255,0.25)'; // dim
}

export function MainCalendar({ tasks, projects, onToggleTask, onUpdateTaskDate, onOpenTask, onDayClick, onMonthChange, habitsByDate, recoveryByDate, whoopEnabled }: MainCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [maxVisibleLanes, setMaxVisibleLanes] = useState(MAX_VISIBLE_LANES_LG);
    const dragPillRef = useRef<HTMLDivElement | null>(null);
    const isMobile = useIsMobile();
    const swipeRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);
    const calendarGridRef = useRef<HTMLDivElement | null>(null);

    // Responsive lane count — 1 lane on small phones, 2 on tablets, 3 on desktop
    useEffect(() => {
        const updateLanes = () => {
            const w = window.innerWidth;
            if (w < 640) setMaxVisibleLanes(1);
            else if (w < 1024) setMaxVisibleLanes(MAX_VISIBLE_LANES_SM);
            else setMaxVisibleLanes(MAX_VISIBLE_LANES_LG);
        };
        updateLanes();
        window.addEventListener('resize', updateLanes);
        return () => window.removeEventListener('resize', updateLanes);
    }, []);

    // Mobile swipe to navigate months
    const handleSwipeStart = useCallback((clientX: number, clientY: number) => {
        swipeRef.current = { startX: clientX, startY: clientY, startTime: Date.now() };
    }, []);

    const handleSwipeEnd = useCallback((clientX: number, clientY: number) => {
        if (!swipeRef.current) return;
        const dx = clientX - swipeRef.current.startX;
        const dy = clientY - swipeRef.current.startY;
        const dt = Date.now() - swipeRef.current.startTime;
        swipeRef.current = null;

        // Must be horizontal, fast enough, and long enough
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 400) {
            if (dx < 0) {
                // Swipe left → next month
                setCurrentMonth(prev => { const m = addMonths(prev, 1); onMonthChange?.(m); return m; });
            } else {
                // Swipe right → previous month
                setCurrentMonth(prev => { const m = subMonths(prev, 1); onMonthChange?.(m); return m; });
            }
        }
    }, [onMonthChange]);

    // Keyboard shortcuts: arrow keys to navigate months, 't' to jump to today
    useKeyboardShortcuts(useMemo(() => ({
        'arrowleft': () => setCurrentMonth(prev => { const m = subMonths(prev, 1); onMonthChange?.(m); return m; }),
        'arrowright': () => setCurrentMonth(prev => { const m = addMonths(prev, 1); onMonthChange?.(m); return m; }),
        't': () => { const m = new Date(); setCurrentMonth(m); onMonthChange?.(m); },
    }), [onMonthChange]));

    const [dragState, setDragState] = useState<{
        task: Task | null;
        isDragging: boolean;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
    }>({ task: null, isDragging: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
    const [dropTarget, setDropTarget] = useState<Date | null>(null);

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const calendarDays = useMemo(() => eachDayOfInterval({ start: calendarStart, end: calendarEnd }), [calendarStart, calendarEnd]);
    const weeks = Math.ceil(calendarDays.length / 7);

    const projectColorMap = PROJECT_COLORS;

    const parseDate = parseLocalDate;

    const todayDate = startOfDay(new Date());

    // Mouse event handlers for click vs drag detection
    const handleMouseDown = useCallback((e: React.MouseEvent, task: Task) => {
        if ((e.target as HTMLElement).closest('.task-checkbox')) return;
        e.preventDefault();
        setDragState({
            task,
            isDragging: false,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY
        });
    }, []);

    // Create / update / destroy floating drag pill
    const updateDragPill = useCallback((task: Task | null, x: number, y: number, visible: boolean) => {
        if (visible && task) {
            if (!dragPillRef.current) {
                const pill = document.createElement('div');
                pill.style.position = 'fixed';
                pill.style.zIndex = '9999';
                pill.style.pointerEvents = 'none';
                pill.style.padding = '4px 10px';
                pill.style.borderRadius = '6px';
                pill.style.fontSize = '11px';
                pill.style.fontWeight = '600';
                pill.style.color = 'rgba(255,255,255,0.9)';
                pill.style.backgroundColor = 'rgba(10,10,10,0.92)';
                pill.style.border = '1px solid rgba(212,175,55,0.4)';
                pill.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                pill.style.maxWidth = '180px';
                pill.style.overflow = 'hidden';
                pill.style.textOverflow = 'ellipsis';
                pill.style.whiteSpace = 'nowrap';
                pill.textContent = task.name || 'Untitled';
                document.body.appendChild(pill);
                dragPillRef.current = pill;
            }
            dragPillRef.current.style.left = `${x + 12}px`;
            dragPillRef.current.style.top = `${y - 14}px`;
        } else {
            if (dragPillRef.current) {
                dragPillRef.current.remove();
                dragPillRef.current = null;
            }
        }
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragState.task) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > DRAG_THRESHOLD && !dragState.isDragging) {
            setDragState(prev => ({ ...prev, isDragging: true, currentX: e.clientX, currentY: e.clientY }));
            document.body.classList.add('dragging-task');
            updateDragPill(dragState.task, e.clientX, e.clientY, true);
        } else if (dragState.isDragging) {
            setDragState(prev => ({ ...prev, currentX: e.clientX, currentY: e.clientY }));
            updateDragPill(dragState.task, e.clientX, e.clientY, true);
            const elements = document.elementsFromPoint(e.clientX, e.clientY);
            const dayCell = elements.find(el => el.hasAttribute('data-date'));
            if (dayCell) {
                const dateStr = dayCell.getAttribute('data-date');
                if (dateStr) setDropTarget(new Date(dateStr));
            } else {
                setDropTarget(null);
            }
        }
    }, [dragState.task, dragState.startX, dragState.startY, dragState.isDragging, updateDragPill]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!dragState.task) return;
        if (dragState.isDragging && dropTarget) {
            const task = dragState.task;
            const isMultiDay = task.start_date && task.due_date && task.start_date !== task.due_date;
            if (isMultiDay) {
                onUpdateTaskDate(task.id, dropTarget, true);
            } else {
                onUpdateTaskDate(task.id, dropTarget);
            }
        } else if (!dragState.isDragging) {
            onOpenTask?.(dragState.task);
        }
        document.body.classList.remove('dragging-task');
        updateDragPill(null, 0, 0, false);
        setDragState({ task: null, isDragging: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
        setDropTarget(null);
    }, [dragState.task, dragState.isDragging, dropTarget, onUpdateTaskDate, onOpenTask, updateDragPill]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!dragState.task) return;
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    }, [dragState.task, handleMouseMove]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (!dragState.task) return;
        const touch = e.changedTouches[0];
        handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    }, [dragState.task, handleMouseUp]);

    useEffect(() => {
        if (dragState.task) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleTouchMove);
                window.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [dragState.task, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    // Cleanup drag pill on unmount
    useEffect(() => {
        return () => {
            if (dragPillRef.current) {
                dragPillRef.current.remove();
                dragPillRef.current = null;
            }
        };
    }, []);

    // Compute week-level lane assignments
    const weekLanes = useMemo(() => {
        const result: LaneEntry[][] = [];

        for (let weekIdx = 0; weekIdx < weeks; weekIdx++) {
            const weekDays = calendarDays.slice(weekIdx * 7, (weekIdx + 1) * 7);
            const weekStart = weekDays[0];
            const weekEnd = weekDays[6];

            // Find all tasks that overlap this week
            const weekTasks: { task: Task; startCol: number; endCol: number; duration: number }[] = [];

            tasks.forEach(task => {
                const dateSource = task.due_date || task.start_date;
                if (!dateSource) return;

                const taskStart = task.start_date ? parseDate(task.start_date) : parseDate(task.due_date!);
                const taskEnd = task.due_date ? parseDate(task.due_date) : taskStart;

                // Check if task overlaps this week
                if (taskEnd < weekStart || taskStart > weekEnd) return;

                // Clamp to week boundaries
                const clampedStart = taskStart < weekStart ? weekStart : taskStart;
                const clampedEnd = taskEnd > weekEnd ? weekEnd : taskEnd;

                const startCol = Math.round((clampedStart.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
                const endCol = Math.round((clampedEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
                const duration = differenceInDays(taskEnd, taskStart);

                weekTasks.push({ task, startCol, endCol, duration });
            });

            // Sort: active before done, multi-day before single, longer before shorter, earlier start first
            weekTasks.sort((a, b) => {
                if (a.task.status !== b.task.status) return a.task.status === 'Done' ? 1 : -1;
                const aMulti = a.duration > 0;
                const bMulti = b.duration > 0;
                if (aMulti !== bMulti) return aMulti ? -1 : 1;
                if (a.duration !== b.duration) return b.duration - a.duration;
                return a.startCol - b.startCol;
            });

            // Assign lanes greedily
            const lanes: LaneEntry[] = [];
            const laneOccupancy: number[][] = []; // laneOccupancy[lane] = array of occupied columns

            weekTasks.forEach(({ task, startCol, endCol }) => {
                // Find first lane where columns startCol..endCol are all free
                let assignedLane = -1;
                for (let lane = 0; lane < laneOccupancy.length; lane++) {
                    const occupied = laneOccupancy[lane];
                    let conflict = false;
                    for (let col = startCol; col <= endCol; col++) {
                        if (occupied.includes(col)) { conflict = true; break; }
                    }
                    if (!conflict) { assignedLane = lane; break; }
                }

                if (assignedLane === -1) {
                    assignedLane = laneOccupancy.length;
                    laneOccupancy.push([]);
                }

                // Mark columns as occupied
                for (let col = startCol; col <= endCol; col++) {
                    laneOccupancy[assignedLane].push(col);
                }

                lanes.push({ task, lane: assignedLane, startCol, endCol });
            });

            result.push(lanes);
        }

        return result;
    }, [tasks, calendarDays, weeks]);

    // Helper: check if task is due today or overdue
    const isUrgent = (task: Task): boolean => {
        if (task.status === 'Done') return false;
        const dueDate = task.due_date ? parseDate(task.due_date) : null;
        if (!dueDate) return false;
        return isSameDay(dueDate, todayDate) || isBefore(dueDate, todayDate);
    };

    // Helper: get task status border style
    const getTaskBorderStyle = (task: Task, dotColor: string): React.CSSProperties => {
        if (task.status === 'Done') {
            return { borderLeftWidth: '2px', borderLeftColor: dotColor };
        }
        if (task.status === 'In Progress') {
            return { borderLeftWidth: '2px', borderLeftColor: dotColor, borderLeftStyle: 'solid' as const };
        }
        // To Do — dashed
        return { borderLeftWidth: '2px', borderLeftColor: dotColor, borderLeftStyle: 'dashed' as const };
    };

    return (
        <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
            {/* Calendar Header */}
            <div className="px-2.5 md:px-4 flex items-center justify-between border-b border-white/10 bg-[#0e0c0a] shrink-0" style={{ height: '56px', minHeight: '56px', boxSizing: 'border-box' }}>
                <div className="flex items-center gap-2 md:gap-4">
                    <h2 className="text-sm md:text-xl font-bold tracking-wide font-serif">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h2>
                    <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg border border-white/5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 md:h-6 md:w-6 hover:bg-athena-gold/10 hover:text-athena-gold active:bg-athena-gold/10" onClick={() => { const m = subMonths(currentMonth, 1); setCurrentMonth(m); onMonthChange?.(m); }}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 md:h-6 md:w-6 hover:bg-athena-gold/10 hover:text-athena-gold active:bg-athena-gold/10" onClick={() => { const m = addMonths(currentMonth, 1); setCurrentMonth(m); onMonthChange?.(m); }}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Mobile: Today button */}
                <button
                    className="md:hidden text-[11px] font-semibold text-athena-gold px-3 py-1.5 rounded-lg border border-athena-gold/20 bg-athena-gold/5 active:bg-athena-gold/15 transition-colors"
                    onClick={() => { const m = new Date(); setCurrentMonth(m); onMonthChange?.(m); }}
                >
                    Today
                </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 shrink-0 border-b border-white/10 bg-[#0e0c0a]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="py-1 md:py-1.5 text-center text-[11px] md:text-xs font-semibold text-muted-foreground">
                        <span className="md:hidden">{day.charAt(0)}</span>
                        <span className="hidden md:inline">{day}</span>
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div
                ref={calendarGridRef}
                className="flex-1 flex flex-col min-h-0 overflow-y-auto"
                onTouchStart={(e) => { if (isMobile) handleSwipeStart(e.touches[0].clientX, e.touches[0].clientY); }}
                onTouchEnd={(e) => { if (isMobile) handleSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }}
            >
                {Array.from({ length: weeks }).map((_, weekIdx) => {
                    const weekDays = calendarDays.slice(weekIdx * 7, (weekIdx + 1) * 7);
                    const lanes = weekLanes[weekIdx] || [];
                    const visibleLaneCount = Math.min(maxVisibleLanes, Math.max(...lanes.map(l => l.lane + 1), 0));
                    const hasOverflow = lanes.some(l => l.lane >= maxVisibleLanes);

                    return (
                        <div key={weekIdx} className="flex-1 border-b border-white/5 last:border-b-0 relative overflow-hidden" style={{ minHeight: isMobile ? '48px' : `${32 + visibleLaneCount * 24 + (hasOverflow ? 18 : 0)}px` }}>
                            {/* Day cells (date headers + backgrounds) */}
                            <div className="grid grid-cols-7 h-full absolute inset-0">
                                {weekDays.map((day, colIdx) => {
                                    const isCurrentMonth = isSameMonth(day, currentMonth);
                                    const isDropTargetDay = dropTarget && isSameDay(day, dropTarget);
                                    const dayStr = format(day, 'yyyy-MM-dd');

                                    // Compute overflow count and total task count for this day
                                    const dayLanes = lanes.filter(l => colIdx >= l.startCol && colIdx <= l.endCol);
                                    const hiddenCount = dayLanes.filter(l => l.lane >= maxVisibleLanes).length;
                                    const dayTaskCount = dayLanes.length;

                                    // Background tints
                                    const taskCountTint = getTaskCountTint(dayTaskCount);
                                    const recoveryScore = recoveryByDate?.[dayStr];
                                    const recoveryTint = whoopEnabled && recoveryScore != null ? getRecoveryTint(recoveryScore) : undefined;

                                    // Habit data
                                    const habitData = habitsByDate?.[dayStr];
                                    const hasHabitData = habitData && habitData.total > 0;

                                    // Combined background: recovery tint takes precedence, then task count tint
                                    const cellBg = recoveryTint || taskCountTint;

                                    return (
                                        <div
                                            key={day.toISOString()}
                                            data-date={day.toISOString()}
                                            onClick={(e) => {
                                                if ((e.target as HTMLElement).closest('.task-item') || (e.target as HTMLElement).closest('.popover-trigger')) return;
                                                onDayClick?.(day);
                                            }}
                                            className={cn(
                                                "border-r border-white/10 last:border-r-0 transition-colors flex flex-col relative",
                                                !isCurrentMonth && "bg-black/40",
                                                isToday(day) && "bg-athena-gold/[0.06] ring-1 ring-inset ring-athena-gold/20",
                                                "hover:bg-white/5",
                                                isDropTargetDay && "bg-blue-500/20 border-blue-500/50"
                                            )}
                                            style={cellBg ? { backgroundColor: cellBg } : undefined}
                                        >
                                            {/* Today column highlight - subtle top border */}
                                            {isToday(day) && (
                                                <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent)' }} />
                                            )}

                                            <div className="flex items-center justify-between px-0.5 pt-0.5">
                                                {/* Date number - top left */}
                                                <span className={cn(
                                                    "text-[10px] md:text-[10px] font-serif inline-flex items-center justify-center w-6 h-6 md:w-[22px] md:h-[22px] leading-none rounded-full shrink-0",
                                                    isToday(day) ? "text-athena-text-primary font-bold" : !isCurrentMonth ? "text-white/20" : "text-white/40",
                                                )}>
                                                    {format(day, 'd')}
                                                </span>

                                                <div className="flex items-center gap-1">
                                                    {/* Desktop: Overflow pill — top right */}
                                                    {hiddenCount > 0 && !isMobile && (
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <button
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="popover-trigger flex items-center justify-center rounded h-6 px-1.5 min-h-[28px] transition-all cursor-pointer bg-athena-gold/10 text-athena-gold hover:bg-athena-gold/20 border border-athena-gold/20"
                                                                >
                                                                    <span className="font-semibold text-[10px] md:text-[9px]">+{hiddenCount}</span>
                                                                </button>
                                                            </PopoverTrigger>
                                                            <PopoverContent side="top" className="max-w-xs bg-[#0a0a0a] border-white/10 text-white shadow-xl p-2 w-56 z-50">
                                                                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                                    <p className="font-semibold text-xs border-b border-white/10 pb-1 mb-1 text-athena-gold">Additional Tasks</p>
                                                                    {dayLanes.filter(l => l.lane >= maxVisibleLanes).map(({ task: t }) => {
                                                                        const proj = projects.find(p => p.id === t.project_id);
                                                                        const projColor = projectColorMap[proj?.color || ''] || projectColorMap.default;
                                                                        const taskDueDate = t.due_date ? parseDate(t.due_date) : null;
                                                                        const showDueDate = taskDueDate && !isSameDay(taskDueDate, day);

                                                                        return (
                                                                            <div key={t.id}
                                                                                className="text-xs flex flex-col gap-0.5 p-1.5 rounded hover:bg-white/5 cursor-pointer transition-colors"
                                                                                onClick={(e) => { e.stopPropagation(); onOpenTask?.(t); }}
                                                                            >
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: projColor }} />
                                                                                    <span className={t.status === 'Done' ? "line-through text-white/50 truncate flex-1" : "text-white/90 truncate flex-1"}>{t.name}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 pl-3 text-[10px] text-white/40">
                                                                                    {proj && <span>{proj.name}</span>}
                                                                                    <span className={cn(
                                                                                        t.status === 'Done' && 'text-green-400/60',
                                                                                        t.status === 'In Progress' && 'text-blue-400/60',
                                                                                    )}>{t.status}</span>
                                                                                    {showDueDate && <span>Due {format(taskDueDate, 'MMM d')}</span>}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Mobile: Task dot indicators */}
                                            {isMobile && dayTaskCount > 0 && (
                                                <div className="flex-1 flex flex-col items-center justify-center gap-0.5 pb-0.5">
                                                    <div className="flex items-center justify-center gap-[3px] flex-wrap max-w-[38px]">
                                                        {dayLanes.slice(0, 4).map(({ task: t }) => {
                                                            const proj = projects.find(p => p.id === t.project_id);
                                                            const projColor = projectColorMap[proj?.color || ''] || projectColorMap.default;
                                                            return (
                                                                <span
                                                                    key={t.id}
                                                                    className={cn("w-[6px] h-[6px] rounded-full", t.status === 'Done' && "opacity-30")}
                                                                    style={{ backgroundColor: projColor }}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    {dayTaskCount > 4 && (
                                                        <span className="text-[8px] text-white/30 leading-none">+{dayTaskCount - 4}</span>
                                                    )}
                                                </div>
                                            )}

                                        </div>
                                    );
                                })}
                            </div>

                            {/* Task bars overlay - desktop only (mobile uses dot indicators + day drawer) */}
                            <div className={cn("relative h-full pt-8 md:pt-7 pb-0 pointer-events-none", isMobile && "hidden")}>
                                {Array.from({ length: Math.min(maxVisibleLanes, Math.max(...lanes.map(l => l.lane + 1), 0)) }, (_, laneIdx) => {
                                    const laneEntries = lanes.filter(l => l.lane === laneIdx);

                                    return (
                                        <div key={laneIdx} className="h-5 lg:h-6 mb-px lg:mb-0.5 relative" style={{ zIndex: 10 }}>
                                            {laneEntries.map(({ task, startCol, endCol }) => {
                                                const project = projects.find(p => p.id === task.project_id);
                                                const dotColor = projectColorMap[project?.color || ''] || projectColorMap.default;
                                                const isDraggingThis = dragState.task?.id === task.id && dragState.isDragging;
                                                const colSpan = endCol - startCol + 1;
                                                const urgent = isUrgent(task);

                                                // Position using percentages for each column
                                                const leftPct = (startCol / 7) * 100;
                                                const widthPct = (colSpan / 7) * 100;

                                                const borderStyle = getTaskBorderStyle(task, dotColor);

                                                return (
                                                    <div
                                                        key={task.id}
                                                        onMouseDown={(e) => handleMouseDown(e, task)}
                                                        onTouchStart={(e) => {
                                                            const touch = e.touches[0];
                                                            handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0, preventDefault: () => {}, stopPropagation: () => {} } as any, task);
                                                        }}
                                                        onClick={(e) => { e.stopPropagation(); onOpenTask?.(task); }}
                                                        className={cn(
                                                            "task-item absolute flex items-center gap-1 lg:gap-1.5 h-5 lg:h-6 text-[10px] lg:text-[13px] cursor-grab transition-all pointer-events-auto rounded md:rounded-md border",
                                                            task.status === 'Done' && "opacity-40",
                                                            isDraggingThis && "opacity-70 cursor-grabbing shadow-lg scale-105",
                                                        )}
                                                        style={{
                                                            left: `calc(${leftPct}% + 2px)`,
                                                            width: `calc(${widthPct}% - 4px)`,
                                                            backgroundColor: `${dotColor}15`,
                                                            borderColor: `${dotColor}30`,
                                                            ...borderStyle,
                                                        }}
                                                    >
                                                        {/* Urgent dot for due today / overdue */}
                                                        {urgent && (
                                                            <span
                                                                className="shrink-0 w-[5px] h-[5px] rounded-full ml-0.5 lg:ml-1"
                                                                style={{ backgroundColor: dotColor, boxShadow: `0 0 4px ${dotColor}` }}
                                                            />
                                                        )}
                                                        <span className={cn(
                                                            "flex-1 font-medium select-none truncate pr-0.5 lg:pr-1 text-[10px] md:text-[10px] lg:text-[13px] leading-tight",
                                                            !urgent && "pl-0.5 lg:pl-1.5",
                                                            task.status === 'Done' ? "text-white/50 line-through" : "text-white/90"
                                                        )}>
                                                            {task.name}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}

                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick-Add FAB — hidden on mobile, visible on desktop */}
            <button
                className="hidden md:flex fixed bottom-8 right-4 z-50 w-14 h-14 rounded-full bg-athena-gold text-athena-bg items-center justify-center shadow-lg shadow-athena-gold/30 active:scale-90 transition-transform"
                onClick={() => onDayClick?.(new Date())}
            >
                <Plus size={24} strokeWidth={2.5} />
            </button>
        </div>
    );
}
