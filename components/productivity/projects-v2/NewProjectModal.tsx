"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { Project } from '@/types/productivity';
import { Loader2, Brain, Rocket, Target, Zap, Cpu, Code, Briefcase, Folder } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface NewProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onProjectCreated: (project: Project) => void;
}

const COLORS = [
    { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
    { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
    { value: 'green', label: 'Green', class: 'bg-green-500' },
    { value: 'slate', label: 'Slate', class: 'bg-slate-500' },
    { value: 'orange', label: 'Orange', class: 'bg-orange-500' },
    { value: 'red', label: 'Red', class: 'bg-red-500' },
    { value: 'gold', label: 'Gold', class: 'bg-athena-gold' },
    { value: 'teal', label: 'Teal', class: 'bg-teal-500' },
];

const ICONS = [
    { value: 'brain', label: 'Brain', icon: Brain },
    { value: 'rocket', label: 'Rocket', icon: Rocket },
    { value: 'target', label: 'Target', icon: Target },
    { value: 'zap', label: 'Zap', icon: Zap },
    { value: 'cpu', label: 'CPU', icon: Cpu },
    { value: 'code', label: 'Code', icon: Code },
    { value: 'briefcase', label: 'Briefcase', icon: Briefcase },
    { value: 'folder', label: 'Folder', icon: Folder },
];

export function NewProjectModal({ isOpen, onClose, onProjectCreated }: NewProjectModalProps) {
    const supabase = createClient();
    const isMobile = useIsMobile();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('default');
    const [selectedIcon, setSelectedIcon] = useState('brain');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);

        const newProject: Project = {
            id: crypto.randomUUID(),
            name: name.trim(),
            description: description.trim() || '',
            overview: description.trim() || '',
            status: 'In Progress',
            created_at: new Date().toISOString(),
            emoji: selectedIcon,
            color: color,
            progress: 0,
            due_date: null
        };

        const { error } = await supabase.from('projects').insert({
            id: newProject.id,
            name: newProject.name,
            overview: newProject.overview,
            status: newProject.status,
            color: newProject.color,
            emoji: newProject.emoji
        });

        setLoading(false);

        if (error) {
            console.error('Error creating project:', error);
            toast.error('Failed to create project');
        } else {
            toast.success('Project created successfully');
            onProjectCreated(newProject);
            handleClose();
        }
    };

    const handleClose = () => {
        setName('');
        setDescription('');
        setColor('default');
        setSelectedIcon('brain');
        onClose();
    };

    const formContent = (
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Website Redesign"
                    className="bg-white/5 border-white/10 focus:border-white/20 h-11 md:h-10"
                    autoFocus
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief overview of the project..."
                    className="bg-white/5 border-white/10 focus:border-white/20 resize-none h-20"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Color Theme</Label>
                    <div className="grid grid-cols-4 gap-2 md:gap-3">
                        {COLORS.map((c) => (
                            <button
                                key={c.value}
                                type="button"
                                onClick={() => setColor(c.value)}
                                className={`h-10 w-10 rounded-md transition-all ${c.class} ${color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-105' : 'opacity-70 hover:opacity-100'
                                    }`}
                                title={c.label}
                            />
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Icon</Label>
                    <div className="grid grid-cols-4 gap-2 max-h-[120px] overflow-y-auto p-1">
                        {ICONS.map((icon) => (
                            <button
                                key={icon.value}
                                type="button"
                                onClick={() => setSelectedIcon(icon.value)}
                                className={`h-10 flex items-center justify-center rounded-md transition-all ${selectedIcon === icon.value
                                    ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 text-white bg-white/10'
                                    : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                                    }`}
                                title={icon.label}
                            >
                                <icon.icon className="w-4 h-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </form>
    );

    const footerContent = (
        <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" onClick={handleClose} disabled={loading} className="hover:bg-white/10 text-zinc-400 hover:text-white h-11 md:h-10">
                Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || loading} className="bg-white text-black hover:bg-white/90 h-11 md:h-10 active:scale-[0.97] transition-transform">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
            </Button>
        </div>
    );

    if (isMobile) {
        return (
            <Drawer open={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
                <DrawerContent className="bg-zinc-950 border-white/10 text-white max-h-[90dvh]">
                    <DrawerHeader className="pb-0 pt-2">
                        <DrawerTitle className="text-left">Create New Project</DrawerTitle>
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
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                {formContent}
                <DialogFooter>
                    {footerContent}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
