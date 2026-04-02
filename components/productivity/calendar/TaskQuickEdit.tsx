"use client";

import { useEffect, useState } from 'react';
import { Task, Project, Section } from '@/types/productivity';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/date-utils';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

interface TaskQuickEditProps {
    task: Task | null;
    open: boolean;
    onClose: () => void;
    projects: Project[];
    sections: Section[];
    onUpdate: () => void;
    onDelete: (taskId: string) => void;
    onCreate?: (task: Task) => void;
    onDraftChange?: (task: Task) => void;
}

// parseLocalDate imported from @/lib/date-utils

// Format date to YYYY-MM-DD string
const formatDateString = (date: Date): string => {
    return format(date, 'yyyy-MM-dd');
};

export function TaskQuickEdit({ task, open, onClose, projects, sections, onUpdate, onDelete, onCreate, onDraftChange }: TaskQuickEditProps) {
    const supabase = createClient();
    const [name, setName] = useState('');
    const [isDone, setIsDone] = useState(false);
    const [projectId, setProjectId] = useState<string>('');
    const [startDate, setStartDate] = useState<Date | undefined>();
    const [dueDate, setDueDate] = useState<Date | undefined>();
    const [saving, setSaving] = useState(false);

    const [startDateOpen, setStartDateOpen] = useState(false);
    const [dueDateOpen, setDueDateOpen] = useState(false);

    const today = startOfDay(new Date());

    useEffect(() => {
        if (task) {
            setName(task.name);
            setIsDone(task.status === 'Done');
            setProjectId(task.project_id || '');
            setStartDate(task.start_date ? parseLocalDate(task.start_date) : undefined);
            setDueDate(task.due_date ? parseLocalDate(task.due_date) : undefined);
        }
    }, [task]);

    const handleSave = async () => {
        if (!task || !name.trim()) return;
        setSaving(true);

        if (task.id === 'new') {
            // Create new task
            const payload = {
                name: name.trim(),
                status: isDone ? 'Done' as const : 'To Do' as const,
                priority: 'Medium' as const,
                start_date: startDate ? formatDateString(startDate) : null,
                due_date: dueDate ? formatDateString(dueDate) : (startDate ? formatDateString(startDate) : null),
                project_id: projectId || task.project_id || projects[0]?.id,
                completed_at: isDone ? new Date().toISOString() : null,
            };

            const { data, error } = await supabase
                .from('tasks')
                .insert(payload)
                .select()
                .single();

            if (error) {
                console.error("Create Error", error);
                toast.error('Failed to create task');
            } else if (data) {
                onCreate?.(data as Task);
                toast.success('Task created');
            }
        } else {
            // Update existing task
            const updates: any = {
                name: name.trim(),
                status: isDone ? 'Done' : 'To Do',
                project_id: projectId || task.project_id,
                start_date: startDate ? formatDateString(startDate) : null,
                due_date: dueDate ? formatDateString(dueDate) : (startDate ? formatDateString(startDate) : null),
            };

            // Handle completed_at
            if (isDone && task.status !== 'Done') {
                updates.completed_at = new Date().toISOString();
            } else if (!isDone) {
                updates.completed_at = null;
            }

            const { error } = await supabase
                .from('tasks')
                .update(updates)
                .eq('id', task.id);

            if (error) {
                toast.error('Failed to save');
            } else {
                onUpdate();
                toast.success('Task updated');
            }
        }

        setSaving(false);
        onClose();
    };

    const handleStartDateChange = (date: Date | undefined) => {
        setStartDate(date);
        setStartDateOpen(false);
        if (date) {
            // Default due date to same as start date  
            if (!dueDate || dueDate < date) {
                setDueDate(date);
            }
            // Auto-open end date picker
            setTimeout(() => setDueDateOpen(true), 150);
        }
    };

    const handleDueDateChange = (date: Date | undefined) => {
        setDueDate(date);
        setDueDateOpen(false);
    };

    const handleDelete = () => {
        if (confirm('Delete this task?')) {
            onDelete(task!.id);
            onClose();
        }
    };

    if (!task) return null;

    const isNew = task.id === 'new';

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-[#0a0a0a] border-white/10 sm:max-w-md text-[#e5e5e5]">
                <DialogHeader>
                    <DialogTitle className="font-serif">
                        {isNew ? 'New Task' : 'Edit Task'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Task Name */}
                    <div>
                        <Label>Task Name *</Label>
                        <Input
                            autoFocus
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-[#0e0c0a] border-white/10 h-10 text-base md:text-sm text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1"
                            placeholder="What needs to be done?"
                        />
                    </div>

                    {/* Done Toggle */}
                    <div>
                        <Label>Status</Label>
                        <button
                            type="button"
                            onClick={() => setIsDone(!isDone)}
                            className={cn(
                                "w-full flex items-center gap-3 h-10 px-3 rounded-md border mt-1 transition-colors",
                                isDone
                                    ? "bg-athena-gold/10 border-athena-gold/30 text-athena-gold"
                                    : "bg-[#0e0c0a] border-white/10 text-white/60 hover:text-white hover:border-white/20"
                            )}
                        >
                            <CheckCircle2 className={cn("w-4 h-4", isDone ? "text-athena-gold" : "text-white/30")} />
                            <span className="text-sm font-medium">{isDone ? 'Completed' : 'Not completed'}</span>
                        </button>
                    </div>

                    {/* Project */}
                    <div>
                        <Label>Project</Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger className="bg-[#0e0c0a] border-white/10 h-10 text-white mt-1 focus:ring-athena-gold">
                                <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#0a0a0a] border-white/10 text-white">
                                {projects
                                    .filter(p => p.status === 'In Progress')
                                    .sort((a, b) => {
                                        if (a.name === 'Personal') return -1;
                                        if (b.name === 'Personal') return 1;
                                        return a.name.localeCompare(b.name);
                                    })
                                    .map(p => (
                                        <SelectItem key={p.id} value={p.id} className="focus:bg-athena-gold/10 focus:text-athena-gold">{p.name}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Start Date</Label>
                            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-[#0e0c0a] border-white/10 h-10 hover:bg-white/5 hover:text-white mt-1",
                                            !startDate && "text-[#525252]"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-white/40" />
                                        {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-[#0a0a0a] border-white/10" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={handleStartDateChange}
                                        disabled={(date) => date < today}
                                        initialFocus
                                        className="bg-[#0a0a0a] text-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div>
                            <Label>End Date</Label>
                            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-[#0e0c0a] border-white/10 h-10 hover:bg-white/5 hover:text-white mt-1",
                                            !dueDate && "text-[#525252]"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-white/40" />
                                        {dueDate ? format(dueDate, "MMM d, yyyy") : "Pick date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-[#0a0a0a] border-white/10" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={dueDate}
                                        onSelect={handleDueDateChange}
                                        disabled={(date) => date < (startDate || today)}
                                        initialFocus
                                        className="bg-[#0a0a0a] text-white"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center gap-2 pt-4 border-t border-white/5 mt-4">
                    {!isNew ? (
                        <Button type="button" variant="ghost" onClick={handleDelete} className="text-red-400 hover:text-red-300 hover:bg-red-950/30 px-3">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </Button>
                    ) : (
                        <div />
                    )}
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={onClose} className="hover:bg-white/5 hover:text-white">Cancel</Button>
                        <Button
                            type="button"
                            disabled={saving || !name.trim()}
                            onClick={handleSave}
                            className="bg-athena-gold text-[#020204] hover:bg-athena-gold-bright font-semibold"
                        >
                            {saving ? 'Saving...' : (isNew ? 'Create Task' : 'Save Changes')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
