import { useState } from 'react';
import { ParsedTask } from './BrainDumpModal';
import { Project, Section } from '@/types/productivity';
import { T, effortConfig, SparkleIcon, RocketIcon, ArrowLeftIcon, CalendarIcon, CheckIcon, RefreshIcon, LayersIcon } from './BrainDumpTheme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { createClient } from '@/utils/supabase/client';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { toast } from 'sonner';
import { getProjectStyles } from './BrainDumpStep2';

interface Props {
    tasks: ParsedTask[];
    projects: Project[];
    sections: Section[];
    onBack: () => void;
    onComplete: () => void;
}

export function BrainDumpStep3({ tasks, projects, sections, onBack, onComplete }: Props) {
    const [localTasks, setLocalTasks] = useState<ParsedTask[]>(tasks);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const supabase = createClient();

    // Selection state: track which task IDs are selected
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
        const ids = new Set<string>();
        tasks.forEach(t => {
            ids.add(t.id);
            if (t.is_epic && t.subtasks) {
                t.subtasks.forEach(s => ids.add(s.id));
            }
        });
        return ids;
    });

    // View mode: 'review' for checklist review, 'timeline' for timeline visualization
    const [viewMode, setViewMode] = useState<'review' | 'timeline'>('review');

    // Editing state for inline task title editing
    const [editingId, setEditingId] = useState<string | null>(null);

    const allTaskIds = localTasks.flatMap(t =>
        t.is_epic && t.subtasks ? [t.id, ...t.subtasks.map(s => s.id)] : [t.id]
    );

    const selectedCount = allTaskIds.filter(id => selectedIds.has(id)).length;
    const totalCount = allTaskIds.length;
    const allSelected = selectedCount === totalCount;
    const noneSelected = selectedCount === 0;

    const toggleTask = (taskId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    const toggleEpicWithSubtasks = (task: ParsedTask) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const epicSelected = next.has(task.id);
            if (epicSelected) {
                // Deselect epic and all subtasks
                next.delete(task.id);
                task.subtasks?.forEach(s => next.delete(s.id));
            } else {
                // Select epic and all subtasks
                next.add(task.id);
                task.subtasks?.forEach(s => next.add(s.id));
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(allTaskIds));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const updateTaskTitle = (taskId: string, newTitle: string) => {
        setLocalTasks(prev => prev.map(t => {
            if (t.id === taskId) return { ...t, title: newTitle };
            if (t.subtasks) {
                return { ...t, subtasks: t.subtasks.map(s => s.id === taskId ? { ...s, title: newTitle } : s) };
            }
            return t;
        }));
    };

    // Filter to only selected tasks for apply
    const getSelectedTasks = (): ParsedTask[] => {
        return localTasks
            .filter(t => {
                if (t.is_epic && t.subtasks) {
                    // Include epic if it or any of its subtasks are selected
                    return selectedIds.has(t.id) || t.subtasks.some(s => selectedIds.has(s.id));
                }
                return selectedIds.has(t.id);
            })
            .map(t => {
                if (t.is_epic && t.subtasks) {
                    return { ...t, subtasks: t.subtasks.filter(s => selectedIds.has(s.id)) };
                }
                return t;
            });
    };

    // Timeline calculations
    const allTasksAndSubtasks = localTasks.flatMap((t) => (t.is_epic && t.subtasks ? [t, ...t.subtasks] : [t]));
    const allDates = allTasksAndSubtasks.flatMap(t => [t.start_date, t.end_date, t.hard_deadline]).filter(Boolean) as string[];
    let minDate = new Date();
    let maxDate = addDays(new Date(), 7);
    if (allDates.length > 0) {
        const sortedDates = allDates.map(d => parseISO(d)).sort((a, b) => a.getTime() - b.getTime());
        minDate = sortedDates[0];
        maxDate = addDays(sortedDates[sortedDates.length - 1], 2);
    }
    const dayCount = Math.max(7, differenceInDays(maxDate, minDate) + 1);
    const timelineDays = Array.from({ length: dayCount }).map((_, i) => addDays(minDate, i));

    const updateTaskDate = (taskId: string, start: Date | undefined, end: Date | undefined) => {
        if (!start) return;
        const updateRecursive = (list: ParsedTask[]): ParsedTask[] => {
            return list.map(t => {
                if (t.id === taskId) {
                    return { ...t, start_date: format(start, 'yyyy-MM-dd'), end_date: end ? format(end, 'yyyy-MM-dd') : undefined };
                }
                if (t.subtasks) return { ...t, subtasks: updateRecursive(t.subtasks) };
                return t;
            });
        };
        setLocalTasks(prev => updateRecursive(prev));
    };

    const handleApply = async () => {
        const tasksToApply = getSelectedTasks();
        if (tasksToApply.length === 0) {
            toast.error('No tasks selected. Select at least one task to apply.');
            return;
        }

        setSaving(true);
        try {
            let totalCreated = 0;
            for (const task of tasksToApply) {
                if (task.is_epic && task.subtasks?.length) {
                    if (!task.projectId) continue;
                    const { data: sectionData, error: sectionError } = await supabase.from('sections').insert({
                        name: task.title, project_id: task.projectId, order: 999
                    }).select('id').single();

                    if (sectionError) throw sectionError;
                    const sectionId = sectionData.id;

                    for (const sub of task.subtasks) {
                        const subDueDate = sub.end_date || sub.start_date;
                        const { error: subError } = await supabase.from('tasks').insert({
                            name: sub.title, project_id: task.projectId, section_id: sectionId,
                            status: 'To Do', start_date: sub.start_date, due_date: subDueDate,
                            priority: sub.effort === 'large' ? 'High' : 'Medium', is_brain_dump_item: true,
                            description: sub.phase ? `Phase: ${sub.phase}\n${sub.ai_description || ''}` : sub.ai_description
                        });
                        if (subError) throw subError;
                        totalCreated++;
                    }
                } else {
                    const dueDate = task.hard_deadline || task.end_date || task.start_date;
                    const { error } = await supabase.from('tasks').insert({
                        name: task.title, project_id: task.projectId, section_id: task.sectionId || null,
                        status: 'To Do', start_date: task.start_date, due_date: dueDate,
                        priority: task.hard_deadline ? 'High' : 'Medium', is_brain_dump_item: true,
                        description: task.reasoning
                    });
                    if (error) throw error;
                    totalCreated++;
                }
            }
            setSaved(true);
            setTimeout(() => {
                toast.success(`Created ${totalCreated} task${totalCreated !== 1 ? 's' : ''} successfully!`);
                onComplete();
            }, 1500);
        } catch (error) {
            console.error("Failed to apply plan:", error);
            toast.error('Failed to create tasks. Check console for details.');
            setSaving(false);
        }
    };

    if (saved) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: T.goldSubtle, border: `1px solid ${T.gold}`, display: "flex", alignItems: "center", justifyContent: "center", animation: "scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                    <CheckIcon size={32} color={T.gold} />
                </div>
                <div style={{ textAlign: "center", animation: "slideUp 0.5s ease 0.1s both" }}>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: T.text, margin: 0 }}>Plan Applied</h2>
                    <p style={{ fontSize: 14, color: T.textMuted, marginTop: 8 }}>
                        {selectedCount} task{selectedCount !== 1 ? 's' : ''} created successfully.
                    </p>
                </div>
                <style>{`
                    @keyframes scaleIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                    @keyframes slideUp { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
                `}</style>
            </div>
        );
    }

    // Checkbox component
    const Checkbox = ({ checked, onChange, size = 18 }: { checked: boolean; onChange: () => void; size?: number }) => (
        <button
            onClick={(e) => { e.stopPropagation(); onChange(); }}
            style={{
                width: size, height: size, borderRadius: 4, flexShrink: 0,
                border: `1.5px solid ${checked ? T.gold : T.border}`,
                background: checked ? T.gold : 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
            }}
        >
            {checked && <CheckIcon size={size - 6} color={T.bg} />}
        </button>
    );

    // Review checklist view
    const renderReviewView = () => (
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, paddingBottom: 16 }} className="custom-scrollbar">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {localTasks.map((task, idx) => {
                    const eff = effortConfig[task.effort || "short"];
                    const project = projects.find(p => p.id === task.projectId);
                    const projStyle = project ? getProjectStyles(project.name) : null;
                    const isTaskSelected = selectedIds.has(task.id);

                    return (
                        <div key={task.id} style={{
                            borderRadius: 0, overflow: "hidden",
                            border: `1px solid ${isTaskSelected ? T.borderActive : T.border}`,
                            background: isTaskSelected ? T.card : T.bg,
                            transition: "all 0.2s ease",
                            opacity: isTaskSelected ? 1 : 0.55,
                            animation: `slideUp 0.3s ease ${idx * 0.03}s both`,
                        }}>
                            {/* Main task row */}
                            <div style={{
                                padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
                            }}>
                                <Checkbox
                                    checked={isTaskSelected}
                                    onChange={() => task.is_epic && task.subtasks?.length ? toggleEpicWithSubtasks(task) : toggleTask(task.id)}
                                />

                                <div style={{
                                    width: 6, height: 6, borderRadius: "50%",
                                    background: projStyle?.accent || eff.color, flexShrink: 0,
                                }} />

                                {editingId === task.id ? (
                                    <input
                                        autoFocus
                                        value={task.title}
                                        onChange={(e) => updateTaskTitle(task.id, e.target.value)}
                                        onBlur={() => setEditingId(null)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                                        style={{
                                            flex: 1, background: T.surface, border: `1px solid ${T.borderActive}`,
                                            outline: "none", color: T.text, fontSize: 13, fontWeight: 500,
                                            fontFamily: "inherit", padding: "4px 8px", borderRadius: 4,
                                        }}
                                    />
                                ) : (
                                    <span
                                        onClick={() => setEditingId(task.id)}
                                        style={{
                                            flex: 1, fontSize: 13, fontWeight: 500, color: T.text,
                                            cursor: "text", lineHeight: 1.4,
                                            textDecoration: isTaskSelected ? 'none' : 'line-through',
                                        }}
                                        title="Click to edit"
                                    >
                                        {task.title}
                                    </span>
                                )}

                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                    <span style={{
                                        padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                        textTransform: "uppercase", letterSpacing: "0.05em",
                                        background: eff.bg, color: eff.color,
                                    }}>
                                        {eff.label}
                                    </span>

                                    {project && (
                                        <span style={{
                                            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                                            background: T.surface, color: projStyle?.accent || T.textMuted,
                                            border: `1px solid ${T.border}`,
                                        }}>
                                            {project.name}
                                        </span>
                                    )}

                                    {task.start_date && (
                                        <span style={{
                                            padding: "2px 7px", borderRadius: 4, fontSize: 10,
                                            background: T.surface, color: T.textMuted,
                                            border: `1px solid ${T.border}`,
                                            display: "flex", alignItems: "center", gap: 3,
                                        }}>
                                            <CalendarIcon size={9} />
                                            {format(parseISO(task.start_date), 'MMM d')}
                                            {task.end_date && task.end_date !== task.start_date && ` - ${format(parseISO(task.end_date), 'MMM d')}`}
                                        </span>
                                    )}

                                    {task.is_epic && task.subtasks && (
                                        <span style={{
                                            padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                            background: T.goldSubtle, color: T.gold,
                                            border: `1px solid ${T.borderActive}`,
                                        }}>
                                            {task.subtasks.filter(s => selectedIds.has(s.id)).length}/{task.subtasks.length} subtasks
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Subtasks for epics */}
                            {task.is_epic && task.subtasks && task.subtasks.length > 0 && (
                                <div style={{
                                    borderTop: `1px solid ${T.border}`, background: T.surface,
                                    padding: "8px 16px 8px 46px",
                                }}>
                                    {/* Group by phase */}
                                    {[...new Set(task.subtasks.map(s => s.phase))].map(phase => (
                                        <div key={phase || 'unphased'} style={{ marginBottom: 6 }}>
                                            {phase && (
                                                <div style={{
                                                    fontSize: 10, fontWeight: 700, color: T.textDim,
                                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                                    marginBottom: 4, padding: "0 4px",
                                                }}>
                                                    {phase}
                                                </div>
                                            )}
                                            {task.subtasks?.filter(s => s.phase === phase).map(sub => {
                                                const subEff = effortConfig[sub.effort || "short"];
                                                const isSubSelected = selectedIds.has(sub.id);
                                                return (
                                                    <div key={sub.id} style={{
                                                        display: "flex", alignItems: "center", gap: 10,
                                                        padding: "6px 8px", marginBottom: 2, borderRadius: 0,
                                                        background: isSubSelected ? T.card : 'transparent',
                                                        border: `1px solid ${isSubSelected ? T.border : 'transparent'}`,
                                                        opacity: isSubSelected ? 1 : 0.5,
                                                        transition: "all 0.2s ease",
                                                    }}>
                                                        <Checkbox
                                                            checked={isSubSelected}
                                                            onChange={() => toggleTask(sub.id)}
                                                            size={16}
                                                        />

                                                        <div style={{
                                                            width: 4, height: 4, borderRadius: 2,
                                                            background: projStyle?.accent || subEff.color, flexShrink: 0,
                                                        }} />

                                                        {editingId === sub.id ? (
                                                            <input
                                                                autoFocus
                                                                value={sub.title}
                                                                onChange={(e) => updateTaskTitle(sub.id, e.target.value)}
                                                                onBlur={() => setEditingId(null)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                                                                style={{
                                                                    flex: 1, background: T.surface, border: `1px solid ${T.borderActive}`,
                                                                    outline: "none", color: T.text, fontSize: 12,
                                                                    fontFamily: "inherit", padding: "3px 6px", borderRadius: 4,
                                                                }}
                                                            />
                                                        ) : (
                                                            <span
                                                                onClick={() => setEditingId(sub.id)}
                                                                style={{
                                                                    flex: 1, fontSize: 12, color: T.text, cursor: "text",
                                                                    textDecoration: isSubSelected ? 'none' : 'line-through',
                                                                }}
                                                                title="Click to edit"
                                                            >
                                                                {sub.title}
                                                            </span>
                                                        )}

                                                        <span style={{
                                                            fontSize: 10, padding: "2px 6px", borderRadius: 3,
                                                            background: subEff.bg, color: subEff.color, fontWeight: 600,
                                                        }}>
                                                            {subEff.minutes}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    // Timeline view (existing functionality)
    const renderTimelineRow = (task: ParsedTask, isSubtask = false) => {
        const isSelected = selectedIds.has(task.id);
        const taskStart = parseISO(task.start_date || format(minDate, 'yyyy-MM-dd'));
        const taskEnd = parseISO(task.end_date || task.start_date || format(minDate, 'yyyy-MM-dd'));
        const dayIndex = differenceInDays(taskStart, minDate);
        const duration = Math.max(1, differenceInDays(taskEnd, taskStart) + 1);

        const eff = effortConfig[task.effort || "short"];
        const leftPixels = dayIndex * 60;
        const widthPixels = duration * 60;

        return (
            <div key={task.id} style={{
                display: "flex", borderBottom: `1px solid ${T.border}`,
                background: isSubtask ? T.bg : T.surfaceHover,
                opacity: isSelected ? 1 : 0.35,
                transition: "all 0.2s", minWidth: "max-content",
            }}>
                {/* Fixed Label Column */}
                <div style={{
                    width: 290, flexShrink: 0, padding: "12px 16px", borderRight: `1px solid ${T.border}`,
                    display: "flex", alignItems: "center", gap: 10,
                    position: "sticky", left: 0, zIndex: 10,
                    background: isSubtask ? T.bg : T.surfaceHover, borderRightWidth: 1,
                }}>
                    <Checkbox
                        checked={isSelected}
                        onChange={() => toggleTask(task.id)}
                        size={16}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        {task.is_epic && <RocketIcon size={12} color={T.blue} />}
                        <span style={{
                            fontSize: 13, fontWeight: isSubtask ? 400 : 500,
                            color: task.is_epic ? T.text : isSubtask ? T.textMuted : T.text,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            paddingLeft: isSubtask ? 16 : 0,
                            textDecoration: isSelected ? 'none' : 'line-through',
                        }}>
                            {task.title}
                        </span>
                    </div>
                </div>

                {/* Timeline Grid */}
                <div style={{ position: "relative", height: 50, width: dayCount * 60, display: "flex" }}>
                    {timelineDays.map((_, i) => <div key={i} style={{ position: "absolute", top: 0, bottom: 0, width: 60, left: i * 60, borderRight: `1px solid ${T.border}` }} />)}

                    {/* Task Bar */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <div style={{
                                position: "absolute", top: 10, height: 30, left: Math.max(0, leftPixels), width: Math.max(4, widthPixels - 4),
                                background: task.is_epic ? T.blueMuted : eff.bg,
                                border: `1px solid ${task.is_epic ? T.blue : eff.color}`,
                                borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", padding: "0 8px",
                                overflow: "hidden", whiteSpace: "nowrap", zIndex: 2, transition: "transform 0.2s, filter 0.2s"
                            }} onMouseEnter={e => { e.currentTarget.style.transform = "scaleY(1.05)"; e.currentTarget.style.filter = "brightness(1.2)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scaleY(1)"; e.currentTarget.style.filter = "brightness(1)"; }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: task.is_epic ? T.blue : eff.color }}>
                                    {task.is_epic ? "Epic" : eff.label}
                                </span>
                            </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[1001]" align="start">
                            <CalendarComponent mode="range" defaultMonth={taskStart} selected={{ from: taskStart, to: taskEnd }} onSelect={(range) => { if (range?.from) updateTaskDate(task.id, range.from, range.to); }} initialFocus />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        );
    };

    const renderTimelineView = () => (
        <div style={{ flex: 1, borderRadius: 0, border: `1px solid ${T.border}`, background: T.bg, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
            <div style={{ flex: 1, overflow: "auto" }} className="custom-scrollbar">
                <div style={{ minWidth: "max-content" }}>
                    {/* Header Row */}
                    <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 20, background: T.card, borderBottomWidth: 1 }}>
                        <div style={{ width: 290, flexShrink: 0, padding: "10px 16px", borderRight: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", position: "sticky", left: 0, zIndex: 30, background: T.card }}>
                            Task / Subtask
                        </div>
                        <div style={{ display: "flex", width: dayCount * 60 }}>
                            {timelineDays.map((day, i) => (
                                <div key={i} style={{ width: 60, padding: "8px 0", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? T.goldSubtle : "transparent" }}>
                                    <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", fontWeight: 600 }}>{format(day, 'EEE')}</div>
                                    <div style={{ fontSize: 14, color: T.text, fontWeight: 500, marginTop: 2 }}>{format(day, 'd')}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Body Rows */}
                    {localTasks.map(task => (
                        <div key={task.id} style={{ display: "flex", flexDirection: "column" }}>
                            {renderTimelineRow(task)}
                            {task.is_epic && task.subtasks && task.subtasks.map(sub => renderTimelineRow(sub, true))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 28px 28px" }}>
            {/* Header controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
                {/* Left side: selection controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        onClick={allSelected ? deselectAll : selectAll}
                        style={{
                            padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                            background: "transparent", border: `1px solid ${T.border}`,
                            color: T.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderActive; e.currentTarget.style.color = T.text; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}
                    >
                        <Checkbox checked={allSelected} onChange={allSelected ? deselectAll : selectAll} size={14} />
                        {allSelected ? "Deselect All" : "Select All"}
                    </button>

                    <div style={{
                        padding: "5px 10px", borderRadius: 0, background: T.surface,
                        border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted,
                        fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 5,
                    }}>
                        <LayersIcon size={11} />
                        {selectedCount}/{totalCount} selected
                    </div>
                </div>

                {/* Right side: view toggle + date range */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                        display: "flex", borderRadius: 4, overflow: "hidden",
                        border: `1px solid ${T.border}`,
                    }}>
                        <button
                            onClick={() => setViewMode('review')}
                            style={{
                                padding: "5px 10px", fontSize: 11, fontWeight: 500,
                                background: viewMode === 'review' ? T.goldSubtle : 'transparent',
                                color: viewMode === 'review' ? T.gold : T.textMuted,
                                border: "none", cursor: "pointer", transition: "all 0.2s",
                                borderRight: `1px solid ${T.border}`,
                            }}
                        >
                            Checklist
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            style={{
                                padding: "5px 10px", fontSize: 11, fontWeight: 500,
                                background: viewMode === 'timeline' ? T.goldSubtle : 'transparent',
                                color: viewMode === 'timeline' ? T.gold : T.textMuted,
                                border: "none", cursor: "pointer", transition: "all 0.2s",
                            }}
                        >
                            Timeline
                        </button>
                    </div>

                    {viewMode === 'timeline' && (
                        <div style={{
                            fontSize: 11, color: T.textDim, display: "flex", alignItems: "center", gap: 5,
                            padding: "5px 10px", background: T.surface, borderRadius: 0, border: `1px solid ${T.border}`,
                        }}>
                            <CalendarIcon size={11} /> {format(minDate, 'MMM d')} - {format(maxDate, 'MMM d')}
                        </div>
                    )}
                </div>
            </div>

            {/* Main content area */}
            {viewMode === 'review' ? renderReviewView() : renderTimelineView()}

            {/* Footer */}
            <div style={{
                marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingTop: 16, borderTop: `1px solid ${T.border}`,
            }}>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={onBack} disabled={saving} style={{
                        padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                        background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted,
                        cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
                    }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderActive; e.currentTarget.style.color = T.text; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}>
                        <ArrowLeftIcon size={14} /> Back
                    </button>
                    <button onClick={onBack} disabled={saving} style={{
                        padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                        background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted,
                        cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s",
                    }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderActive; e.currentTarget.style.color = T.gold; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}>
                        <RefreshIcon size={13} /> Regenerate
                    </button>
                </div>
                <button onClick={handleApply} disabled={saving || noneSelected} style={{
                    padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: noneSelected ? T.textDim : T.text, color: T.bg, border: "none",
                    cursor: (saving || noneSelected) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                    opacity: noneSelected ? 0.5 : 1,
                }} onMouseEnter={e => { if (!noneSelected) e.currentTarget.style.transform = "scale(1.02)"; }} onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
                    {saving ? <span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}><SparkleIcon size={14} color={T.bg} /></span> : <RocketIcon size={14} color={T.bg} />}
                    {saving ? "Creating Plan..." : `Commit ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
                </button>
            </div>
        </div>
    );
}
