"use client";

import { useEffect, useState } from 'react';
import { Task, Project, Section } from '@/types/productivity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, startOfDay } from 'date-fns';
import { Calendar as CalendarIcon, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/date-utils';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
} from '@/components/ui/drawer';

interface MobileTaskEditorProps {
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

const formatDateString = (date: Date): string => format(date, 'yyyy-MM-dd');

export function MobileTaskEditor({ task, open, onClose, projects, sections, onUpdate, onDelete, onCreate, onDraftChange }: MobileTaskEditorProps) {
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
                toast.error('Failed to create task');
            } else if (data) {
                onCreate?.(data as Task);
                toast.success('Task created');
            }
        } else {
            const updates: any = {
                name: name.trim(),
                status: isDone ? 'Done' : 'To Do',
                project_id: projectId || task.project_id,
                start_date: startDate ? formatDateString(startDate) : null,
                due_date: dueDate ? formatDateString(dueDate) : (startDate ? formatDateString(startDate) : null),
            };

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
            if (!dueDate || dueDate < date) {
                setDueDate(date);
            }
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
        <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DrawerContent className="bg-[#0a0a0a] border-white/10 max-h-[85dvh]">
                <DrawerHeader className="pb-1 pt-2">
                    <DrawerTitle className="font-serif text-left text-lg text-[#e5e5e5]">
                        {isNew ? 'New Task' : 'Edit Task'}
                    </DrawerTitle>
                </DrawerHeader>

                <div className="px-4 pb-6 overflow-y-auto flex-1 min-h-0 space-y-4">
                    {/* Task Name */}
                    <div>
                        <Label className="text-xs text-white/50">Task Name *</Label>
                        <Input
                            autoFocus
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-[#0e0c0a] border-white/10 h-12 text-base text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1"
                            placeholder="What needs to be done?"
                        />
                    </div>

                    {/* Status Toggle */}
                    <div>
                        <Label className="text-xs text-white/50">Status</Label>
                        <button
                            type="button"
                            onClick={() => setIsDone(!isDone)}
                            className={cn(
                                "w-full flex items-center gap-3 h-12 px-4 rounded-xl border mt-1 transition-colors active:scale-[0.98]",
                                isDone
                                    ? "bg-athena-gold/10 border-athena-gold/30 text-athena-gold"
                                    : "bg-[#0e0c0a] border-white/10 text-white/60"
                            )}
                        >
                            <CheckCircle2 className={cn("w-5 h-5", isDone ? "text-athena-gold" : "text-white/30")} />
                            <span className="text-sm font-medium">{isDone ? 'Completed' : 'Not completed'}</span>
                        </button>
                    </div>

                    {/* Project */}
                    <div>
                        <Label className="text-xs text-white/50">Project</Label>
                        <Select value={projectId} onValueChange={setProjectId}>
                            <SelectTrigger className="bg-[#0e0c0a] border-white/10 h-12 text-white mt-1 focus:ring-athena-gold text-sm">
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
                                        <SelectItem key={p.id} value={p.id} className="focus:bg-athena-gold/10 focus:text-athena-gold h-10">{p.name}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Dates - stacked on mobile */}
                    <div className="space-y-3">
                        <div>
                            <Label className="text-xs text-white/50">Start Date</Label>
                            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-[#0e0c0a] border-white/10 h-12 hover:bg-white/5 hover:text-white mt-1",
                                            !startDate && "text-[#525252]"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-white/40" />
                                        {startDate ? format(startDate, "MMM d, yyyy") : "Pick date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-[#0a0a0a] border-white/10" align="center" side="top">
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
                            <Label className="text-xs text-white/50">End Date</Label>
                            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-[#0e0c0a] border-white/10 h-12 hover:bg-white/5 hover:text-white mt-1",
                                            !dueDate && "text-[#525252]"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-white/40" />
                                        {dueDate ? format(dueDate, "MMM d, yyyy") : "Pick date"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-[#0a0a0a] border-white/10" align="center" side="top">
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
                <div className="px-4 pb-8 pt-2 border-t border-white/5 flex items-center gap-2">
                    {!isNew && (
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={handleDelete}
                            className="text-red-400 active:text-red-300 active:bg-red-950/30 px-3 h-12"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="text-white/50 h-12 px-5"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !name.trim()}
                        onClick={handleSave}
                        className="bg-athena-gold text-[#020204] hover:bg-athena-gold-bright font-semibold h-12 px-6 active:scale-[0.97] transition-transform"
                    >
                        {saving ? 'Saving...' : (isNew ? 'Create' : 'Save')}
                    </Button>
                </div>
            </DrawerContent>
        </Drawer>
    );
}
