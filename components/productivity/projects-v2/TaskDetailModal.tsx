"use client";

import { useEffect, useState } from 'react';
import { Task, Project, Section } from '@/types/productivity';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface TaskDetailModalProps {
    task: Task | null;
    open: boolean;
    onClose: () => void;
    projects: Project[];
    sections: Section[];
    onUpdate: () => void;
    onDelete: (taskId: string) => void;
}

export function TaskDetailModal({ task, open, onClose, projects, sections, onUpdate, onDelete }: TaskDetailModalProps) {
    const supabase = createClient();
    const isMobile = useIsMobile();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'To Do' | 'In Progress' | 'Done'>('To Do');
    const [sectionId, setSectionId] = useState<string>('unassigned');
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [dueDate, setDueDate] = useState<Date | undefined>();

    // Project is read-only for now as moving tasks between projects is complex
    const project = task ? projects.find(p => p.id === task.project_id) : null;
    const projectSections = project ? sections.filter(s => s.project_id === project.id) : [];

    useEffect(() => {
        if (task) {
            setName(task.name);
            setDescription(task.description || '');
            setStatus(task.status);
            setSectionId(task.section_id || 'unassigned');
            setStartDate(task.start_date ? parseISO(task.start_date) : undefined);
            setDueDate(task.due_date ? parseISO(task.due_date) : undefined);
        }
    }, [task]);

    const handleSave = async () => {
        if (!task) return;

        const updates: any = {
            name,
            description,
            status,
            section_id: sectionId === 'unassigned' ? null : sectionId,
            start_date: startDate ? startDate.toISOString() : null,
            due_date: dueDate ? dueDate.toISOString() : null,
            completed_at: status === 'Done' && task.status !== 'Done' ? new Date().toISOString() : (status !== 'Done' ? null : task.completed_at)
        };

        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', task.id);

        if (error) {
            toast.error('Failed to update task');
        } else {
            toast.success('Task updated');
            onUpdate();
            onClose();
        }
    };

    const handleDelete = async () => {
        if (!task) return;
        if (confirm('Are you sure you want to delete this task?')) {
            onDelete(task.id);
            onClose();
        }
    };

    if (!task) return null;

    const formContent = (
        <div className="space-y-4 py-4 px-1">
            {/* Title */}
            <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Title</label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white/5 border-white/10 focus:border-white/30 font-medium h-11 md:h-10"
                />
            </div>

            {/* Description */}
            <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-muted-foreground">Description</label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-white/5 border-white/10 focus:border-white/30 min-h-[80px]"
                    placeholder="Add details..."
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Status */}
                <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Status</label>
                    <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                        <SelectTrigger className="bg-white/5 border-white/10 h-11 md:h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                            <SelectItem value="To Do">To Do</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Done">Done</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Section */}
                <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Section</label>
                    <Select value={sectionId} onValueChange={setSectionId}>
                        <SelectTrigger className="bg-white/5 border-white/10 h-11 md:h-10">
                            <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-white/10 text-white">
                            <SelectItem value="unassigned">Uncategorized</SelectItem>
                            {projectSections.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Start Date</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 hover:text-white h-11 md:h-10",
                                    !startDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {startDate ? format(startDate, "MMM d") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-black border-white/10" align={isMobile ? "center" : "start"} side={isMobile ? "top" : "bottom"}>
                            <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="bg-black text-white" />
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold uppercase text-muted-foreground">End Date</label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal bg-white/5 border-white/10 hover:bg-white/10 hover:text-white h-11 md:h-10",
                                    !dueDate && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dueDate ? format(dueDate, "MMM d") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-black border-white/10" align={isMobile ? "center" : "start"} side={isMobile ? "top" : "bottom"}>
                            <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="bg-black text-white" />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
    );

    const footerContent = (
        <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-950/30 h-11 md:h-10">
                <Trash2 className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Delete</span>
            </Button>
            <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} className="border-white/10 h-11 md:h-10">Cancel</Button>
                <Button onClick={handleSave} className="bg-white text-black hover:bg-white/90 h-11 md:h-10 active:scale-[0.97] transition-transform">Save</Button>
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
                <DrawerContent className="bg-black/95 backdrop-blur-xl border-white/10 text-white max-h-[85dvh]">
                    <DrawerHeader className="pb-0 pt-2">
                        <DrawerTitle className="flex items-center gap-2 text-left">
                            <span className="text-lg">{project?.emoji}</span>
                            <span className="text-muted-foreground font-normal text-sm">Task in {project?.name}</span>
                        </DrawerTitle>
                    </DrawerHeader>
                    <div className="px-4 overflow-y-auto flex-1 min-h-0">
                        {formContent}
                    </div>
                    <div className="px-4 pb-8 pt-3 border-t border-white/5">
                        {footerContent}
                    </div>
                </DrawerContent>
            </Drawer>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px] bg-black/95 backdrop-blur-xl border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="text-xl">{project?.emoji}</span>
                        <span className="text-muted-foreground font-normal">Task in {project?.name}</span>
                    </DialogTitle>
                </DialogHeader>
                {formContent}
                <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
                    {footerContent}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
