"use client";

import { Project, Task, Section } from '@/types/productivity';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { BurndownPrediction } from './charts/BurndownPrediction';
import { ActivityHeatmap } from './charts/ActivityHeatmap';
import { MomentumGauge } from './charts/MomentumGauge';
import { CheckSquare, Calendar, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface ProjectDetailModalProps {
    project: Project | null;
    open: boolean;
    onClose: () => void;
    tasks: Task[];
    sections: Section[];
    onToggleTask: (task: Task) => void;
}

export function ProjectDetailModal({ project, open, onClose, tasks, sections, onToggleTask }: ProjectDetailModalProps) {
    if (!project) return null;

    const orderedSections = [...sections].sort((a, b) => a.order - b.order);
    const unsectionedTasks = tasks.filter(t => !t.section_id);

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-[800px] sm:w-[540px] border-l border-white/10 bg-black/95 backdrop-blur-xl p-0 flex flex-col">
                <SheetHeader className="p-6 border-b border-white/10">
                    <div className="flex items-start justify-between">
                        <div>
                            <SheetTitle className="text-2xl flex items-center gap-3">
                                <span className="text-3xl">{project.emoji}</span>
                                {project.name}
                            </SheetTitle>
                            <SheetDescription className="mt-2 text-base">
                                {project.overview}
                            </SheetDescription>
                        </div>
                        <Badge variant="outline" className={cn("capitalize",
                            project.status === 'In Progress' ? "border-green-500/50 text-green-400" : "border-white/20"
                        )}>
                            {project.status}
                        </Badge>
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="p-6 space-y-8">

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-64">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
                                <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-4 w-full text-left">Activity</h4>
                                <div className="flex-1 w-full flex items-center justify-center">
                                    <ActivityHeatmap tasks={tasks} color={project.color || 'blue'} />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
                                <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-4 w-full text-left">Momentum</h4>
                                <div className="flex-1 w-full flex items-center justify-center">
                                    <MomentumGauge tasks={tasks} projectStatus={project.status} />
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col">
                                <h4 className="text-[10px] uppercase font-bold text-muted-foreground mb-4">Projection</h4>
                                <div className="flex-1 w-full relative">
                                    <BurndownPrediction tasks={tasks} projectCreatedAt={project.created_at} deadline={project.deadline} compact={false} />
                                </div>
                            </div>
                        </div>

                        {/* Tasks List */}
                        <div className="space-y-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Folder className="w-5 h-5 text-muted-foreground" />
                                Project Content
                            </h3>

                            <div className="space-y-4">
                                {/* Unsectioned Tasks first */}
                                {unsectionedTasks.length > 0 && (
                                    <div className="space-y-1">
                                        <h4 className="text-sm font-medium text-muted-foreground mb-2 px-2">Uncategorized</h4>
                                        {unsectionedTasks.map(task => (
                                            <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
                                        ))}
                                    </div>
                                )}

                                {/* Sections */}
                                {orderedSections.map(section => {
                                    const sectionTasks = tasks.filter(t => t.section_id === section.id);
                                    // Always show sections in detail view too
                                    return (
                                        <SectionGroup
                                            key={section.id}
                                            section={section}
                                            tasks={sectionTasks}
                                            onToggleTask={onToggleTask}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

function SectionGroup({ section, tasks, onToggleTask }: { section: Section, tasks: Task[], onToggleTask: (t: Task) => void }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
            <div className="flex items-center gap-2 group cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors">
                <CollapsibleTrigger asChild>
                    <button className="p-1 hover:bg-white/10 rounded">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </button>
                </CollapsibleTrigger>
                <span className="font-semibold text-sm flex-1">{section.name}</span>
                <span className="text-xs text-muted-foreground">{tasks.filter(t => t.status === 'Done').length}/{tasks.length}</span>
            </div>

            <CollapsibleContent className="pl-4 space-y-1 border-l-2 border-white/5 ml-4">
                {tasks.length > 0 ? (
                    tasks.map(task => (
                        <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
                    ))
                ) : (
                    <div className="py-2 text-xs text-muted-foreground italic px-2">No tasks in this section</div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}

function TaskRow({ task, onToggle }: { task: Task, onToggle: (t: Task) => void }) {
    return (
        <div className="flex items-center gap-3 py-2 px-2 rounded hover:bg-white/5 group transition-colors">
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(task); }}
                className={cn(
                    "w-4 h-4 border rounded flex items-center justify-center transition-all shrink-0",
                    task.status === 'Done' ? "bg-green-500/20 border-green-500 text-green-500" : "border-white/20 hover:border-white/60"
                )}
            >
                {task.status === 'Done' && <CheckSquare className="w-3 h-3" />}
            </button>

            <div className="flex-1 min-w-0">
                <p className={cn(
                    "text-sm font-mono truncate transition-all",
                    task.status === 'Done' && "text-muted-foreground line-through opacity-50"
                )}>
                    {task.name}
                </p>
            </div>

            {task.due_date && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-white/5 px-2 py-1 rounded shrink-0">
                    <Calendar className="w-3 h-3" />
                    <span>{format(parseISO(task.due_date), 'MMM d')}</span>
                </div>
            )}
        </div>
    );
}
