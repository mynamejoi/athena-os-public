import { useState, useEffect } from 'react';
import { ParsedTask } from './BrainDumpModal';
import { Project, Section } from '@/types/productivity';
import { T, effortConfig, SparkleIcon, BrainIcon, ArrowRightIcon, ArrowLeftIcon, CalendarIcon, LayersIcon, ClockIcon, XIcon, ChevronDownIcon, RefreshIcon } from './BrainDumpTheme';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

export function getProjectStyles(name: string) {
    const l = name.toLowerCase();
    if (l.includes('athena')) return { color: "text-athena-gold", accent: "#d4a843" };
    if (l.includes('personal')) return { color: "text-cyan-400", accent: "#22d3ee" };
    return { color: "text-zinc-400", accent: "#a1a1aa" };
}

interface Props {
    text: string;
    existingTasks?: ParsedTask[];
    projects: Project[];
    sections: Section[];
    onBack: () => void;
    onNext: (tasks: ParsedTask[]) => void;
}

export function BrainDumpStep2({ text, existingTasks, projects, sections, onBack, onNext }: Props) {
    const [tasks, setTasks] = useState<ParsedTask[]>(existingTasks || []);
    const [loading, setLoading] = useState(!existingTasks?.length);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [breakingDown, setBreakingDown] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (existingTasks && existingTasks.length > 0) return;

        async function parseText() {
            try {
                const res = await fetch('/api/productivity/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text,
                        projects: projects.map(p => ({ id: p.id, name: p.name })),
                        sections: sections.map(s => ({ id: s.id, name: s.name, project_id: s.project_id }))
                    })
                });
                if (!res.ok) throw new Error('Failed to parse');
                const data = await res.json();
                const parsedTasks: ParsedTask[] = (data.tasks || []).map((t: Record<string, unknown>, idx: number) => ({
                    id: `temp-${idx}`,
                    title: (t.title as string) || 'Untitled Task',
                    projectId: (t.projectId as string) || (projects[0]?.id || ''),
                    sectionId: (t.sectionId as string) || undefined,
                    needsPlanning: false,
                    start_date: t.start_date,
                    end_date: t.end_date,
                    hard_deadline: t.hard_deadline,
                    effort: t.effort || 'short',
                    reasoning: t.reasoning
                }));
                setTasks(parsedTasks);
            } catch (error) {
                console.error('Parsing failed:', error);
                const fallback = text.split('\n').filter(l => l.trim().length > 0).map((line, idx) => ({
                    id: `temp-${idx}`, title: line, projectId: projects[0]?.id || '', needsPlanning: false, effort: 'short', start_date: new Date().toISOString().split('T')[0]
                } as ParsedTask));
                setTasks(fallback);
            } finally {
                setLoading(false);
            }
        }
        parseText();
    }, [text, projects, sections, existingTasks]);

    const updateTask = (id: string, updates: Partial<ParsedTask>) => {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    };

    const removeTask = (id: string) => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
    };

    const cycleEffort = (id: string) => {
        const efforts: ('quick' | 'short' | 'medium' | 'large')[] = ["quick", "short", "medium", "large"];
        setTasks((prev) =>
            prev.map((t) => {
                if (t.id !== id) return t;
                const idx = efforts.indexOf(t.effort || "short");
                return { ...t, effort: efforts[(idx + 1) % efforts.length] };
            })
        );
    };

    const handleBreakdown = async (task: ParsedTask) => {
        setBreakingDown(prev => ({ ...prev, [task.id]: true }));
        try {
            const res = await fetch('/api/productivity/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task_title: task.title,
                    start_date: task.start_date || new Date().toISOString().split('T')[0],
                    end_date_hint: task.end_date,
                    today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                })
            });
            if (!res.ok) throw new Error('Breakdown failed');
            const data = await res.json();
            const newSubtasks: ParsedTask[] = [];
            let phaseOrder = 0;
            data.phases?.forEach((phase: Record<string, unknown>) => {
                (phase.tasks as Record<string, unknown>[])?.forEach((sub: Record<string, unknown>, idx: number) => {
                    newSubtasks.push({
                        id: `sub-${task.id}-${phaseOrder}-${idx}`,
                        title: sub.title as string, projectId: task.projectId, sectionId: task.sectionId,
                        start_date: sub.start_date as string | undefined, end_date: sub.end_date as string | undefined, effort: (sub.effort as 'quick' | 'short' | 'medium' | 'large') || 'short',
                        needsPlanning: false, is_epic: false, parent_task_id: task.id,
                        phase: phase.name as string, phase_order: idx, ai_description: sub.description as string | undefined
                    });
                });
                phaseOrder++;
            });
            updateTask(task.id, { subtasks: newSubtasks, is_epic: true });
            toast.success(`Generated ${newSubtasks.length} subtasks!`);
            setExpandedId(task.id);
        } catch (error) {
            console.error(error);
            toast.error('Failed to break down task');
        } finally {
            setBreakingDown(prev => ({ ...prev, [task.id]: false }));
        }
    };

    const totalEffort = tasks.reduce((acc, t) => {
        const mins = { quick: 15, short: 30, medium: 90, large: 180 };
        if (t.subtasks?.length) return acc + t.subtasks.reduce((a, s) => a + (mins[s.effort || 'short'] || 30), 0);
        return acc + (mins[t.effort || 'short'] || 30);
    }, 0);

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
                <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}><SparkleIcon size={32} color={T.gold} /></span>
                <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 16, fontWeight: 500, color: T.text }}>Analyzing your brain dump...</p>
                    <p style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>Extracting tasks, dates, and estimating effort</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 28px 28px" }}>
            {/* Header / Meta Info */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 12, gap: 12 }}>
                <div style={{ padding: "6px 12px", borderRadius: 0, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.textMuted, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6 }}>
                    <LayersIcon size={12} /> {tasks.length} tasks
                </div>
                <div style={{ padding: "6px 12px", borderRadius: 0, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12, color: T.textMuted, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6 }}>
                    <ClockIcon size={12} /> ~{Math.round(totalEffort / 60)}h total
                </div>
            </div>

            {/* Task List */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: 4, paddingBottom: 16 }} className="custom-scrollbar">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tasks.map((task, idx) => {
                        const eff = effortConfig[task.effort || "short"];
                        const isExpanded = expandedId === task.id;
                        const project = projects.find(p => p.id === task.projectId);
                        const projColor = project ? getProjectStyles(project.name).accent : eff.color;
                        const isRange = ["medium", "large"].includes(task.effort || "short") || task.is_epic;

                        return (
                            <div key={task.id} style={{ borderRadius: 0, overflow: "hidden", border: `1px solid ${isExpanded ? T.borderActive : T.border}`, background: T.card, transition: "all 0.3s ease", animation: `slideUp 0.3s ease ${idx * 0.05}s both` }}>
                                {/* Main Row */}
                                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : task.id)}>
                                    <button onClick={(e) => { e.stopPropagation(); cycleEffort(task.id); }} title="Cycle effort" style={{ width: 8, height: 8, borderRadius: "50%", background: projColor, border: "none", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }} />

                                    <input value={task.title} onChange={(e) => updateTask(task.id, { title: e.target.value })} onClick={e => e.stopPropagation()} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 14, fontWeight: 500, fontFamily: "inherit" }} />

                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                        <span onClick={(e) => { e.stopPropagation(); cycleEffort(task.id); }} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", background: eff.bg, color: eff.color, cursor: "pointer", transition: "all 0.2s" }}>
                                            {eff.label}
                                        </span>

                                        <Popover>
                                            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <button style={{ padding: "3px 8px", borderRadius: 0, fontSize: 11, background: T.surface, color: T.textMuted, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                                    <CalendarIcon size={10} />
                                                    {task.start_date ? format(parseISO(task.start_date), 'MMM d') : "No date"}
                                                    {isRange && task.end_date && task.end_date !== task.start_date ? ` - ${format(parseISO(task.end_date), 'MMM d')}` : ""}
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 z-[1001]" align="start">
                                                {isRange ? (
                                                    <CalendarComponent
                                                        mode="range"
                                                        defaultMonth={task.start_date ? parseISO(task.start_date) : undefined}
                                                        selected={{ from: task.start_date ? parseISO(task.start_date) : undefined, to: task.end_date ? parseISO(task.end_date) : undefined }}
                                                        onSelect={(range) => {
                                                            const f = range?.from;
                                                            const t = range?.to;
                                                            if (f) updateTask(task.id, { start_date: format(f, 'yyyy-MM-dd'), end_date: t ? format(t, 'yyyy-MM-dd') : undefined })
                                                        }}
                                                        initialFocus
                                                    />
                                                ) : (
                                                    <CalendarComponent
                                                        mode="single"
                                                        selected={task.start_date ? parseISO(task.start_date) : undefined}
                                                        onSelect={(d) => { if (d) updateTask(task.id, { start_date: format(d, 'yyyy-MM-dd') }) }}
                                                        initialFocus
                                                    />
                                                )}
                                            </PopoverContent>
                                        </Popover>

                                        <select value={task.projectId} onChange={(e) => updateTask(task.id, { projectId: e.target.value })} onClick={(e) => e.stopPropagation()} style={{ padding: "3px 6px", borderRadius: 0, fontSize: 11, background: T.surface, color: T.textMuted, border: `1px solid ${T.border}`, outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>

                                        {/* AI Breakdown Button */}
                                        {(["medium", "large"].includes(task.effort || "") || task.is_epic) && (
                                            <button onClick={(e) => { e.stopPropagation(); if (task.subtasks?.length) { setExpandedId(isExpanded ? null : task.id); } else { handleBreakdown(task); } }} disabled={breakingDown[task.id]} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", background: task.is_epic ? T.goldSubtle : "transparent", color: task.is_epic ? T.gold : T.textDim, border: `1px solid ${task.is_epic ? T.borderActive : T.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s" }}>
                                                {breakingDown[task.id] ? (
                                                    <><span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}><SparkleIcon size={10} color={T.gold} /></span> Breaking down...</>
                                                ) : task.is_epic ? (
                                                    <><SparkleIcon size={10} color={T.gold} /> {task.subtasks?.length} subtasks <ChevronDownIcon size={10} /></>
                                                ) : (
                                                    <><SparkleIcon size={10} color={T.textDim} /> Break down</>
                                                )}
                                            </button>
                                        )}

                                        <button onClick={(e) => { e.stopPropagation(); removeTask(task.id); }} style={{ width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: T.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4, transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = T.red; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.4"; e.currentTarget.style.color = T.textDim; }}>
                                            <XIcon size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Subtasks */}
                                {isExpanded && task.subtasks && (
                                    <div onClick={e => e.stopPropagation()} style={{ borderTop: `1px solid ${T.border}`, background: T.surface, padding: "12px 16px", animation: "fadeIn 0.3s ease" }}>
                                        {[...new Set(task.subtasks.map((s) => s.phase))].map((phase) => (
                                            <div key={phase || 'unphased'} style={{ marginBottom: 12 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, padding: "0 4px" }}>
                                                    {phase}
                                                </div>
                                                {task.subtasks?.filter((s) => s.phase === phase).map((sub) => {
                                                    const subEff = effortConfig[sub.effort || "short"];
                                                    const isSubRange = ["medium", "large"].includes(sub.effort || "short");
                                                    return (
                                                        <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 0, background: T.card, border: `1px solid ${T.border}`, marginBottom: 4 }}>
                                                            <div style={{ width: 4, height: 4, borderRadius: 2, background: projColor, flexShrink: 0 }} />
                                                            <input value={sub.title} onChange={(e) => setTasks((prev) => prev.map((t) => t.id === task.id && t.subtasks ? { ...t, subtasks: t.subtasks.map((s) => (s.id === sub.id ? { ...s, title: e.target.value } : s)) } : t))} style={{ flex: 1, fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none" }} />

                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <button style={{ padding: "3px 8px", borderRadius: 0, fontSize: 10, background: T.surface, color: T.textMuted, border: "none", outline: "none", cursor: "pointer" }}>
                                                                        {sub.start_date ? format(parseISO(sub.start_date), 'MMM d') : "-"}
                                                                        {isSubRange && sub.end_date && sub.end_date !== sub.start_date ? ` - ${format(parseISO(sub.end_date), 'MMM d')}` : ""}
                                                                    </button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0 z-[1001]" align="end">
                                                                    {isSubRange ? (
                                                                        <CalendarComponent mode="range" defaultMonth={sub.start_date ? parseISO(sub.start_date) : undefined} selected={{ from: sub.start_date ? parseISO(sub.start_date) : undefined, to: sub.end_date ? parseISO(sub.end_date) : undefined }} onSelect={(range) => {
                                                                            const f = range?.from;
                                                                            const t = range?.to;
                                                                            if (f) {
                                                                                setTasks((prev) => prev.map((t2) => t2.id === task.id && t2.subtasks ? { ...t2, subtasks: t2.subtasks.map((s) => (s.id === sub.id ? { ...s, start_date: format(f, 'yyyy-MM-dd'), end_date: t ? format(t, 'yyyy-MM-dd') : undefined } : s)) } : t2))
                                                                            }
                                                                        }} initialFocus />
                                                                    ) : (
                                                                        <CalendarComponent mode="single" selected={sub.start_date ? parseISO(sub.start_date) : undefined} onSelect={(d) => {
                                                                            if (d) {
                                                                                setTasks((prev) => prev.map((t2) => t2.id === task.id && t2.subtasks ? { ...t2, subtasks: t2.subtasks.map((s) => (s.id === sub.id ? { ...s, start_date: format(d, 'yyyy-MM-dd') } : s)) } : t2))
                                                                            }
                                                                        }} initialFocus />
                                                                    )}
                                                                </PopoverContent>
                                                            </Popover>

                                                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: subEff.bg, color: subEff.color, fontWeight: 600 }}>{subEff.minutes}</span>

                                                            <button onClick={() => setTasks((prev) => prev.map((t) => t.id === task.id && t.subtasks ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== sub.id) } : t))} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: T.textDim, cursor: "pointer", opacity: 0.5 }} onMouseEnter={e => { e.currentTarget.style.color = T.red; e.currentTarget.style.opacity = "1"; }} onMouseLeave={e => { e.currentTarget.style.color = T.textDim; e.currentTarget.style.opacity = "0.5"; }}><XIcon size={12} /></button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ))}
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                                            <button onClick={() => handleBreakdown(task)} style={{ fontSize: 11, color: T.textDim, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, transition: "color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.color = T.gold} onMouseLeave={(e) => e.currentTarget.style.color = T.textDim}>
                                                <RefreshIcon size={11} /> Regenerate
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <button onClick={onBack} style={{ padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "transparent", border: `1px solid ${T.border}`, color: T.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.borderActive; e.currentTarget.style.color = T.text; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMuted; }}>
                    <ArrowLeftIcon size={14} /> Back
                </button>
                <button onClick={() => onNext(tasks)} style={{ padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: T.gold, color: T.bg, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.3s ease", letterSpacing: "0.01em" }}>
                    Review Timeline
                    <ArrowRightIcon size={14} />
                </button>
            </div>
        </div >
    );
}
