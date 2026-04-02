"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Project, Task, Section } from '@/types/productivity';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Brain } from 'lucide-react';
import { ProjectCard } from './projects-v2/ProjectCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BrainDumpModal } from './projects-v2/BrainDumpModal';
import { TaskDetailModal } from './projects-v2/TaskDetailModal';
import { NewProjectModal } from './projects-v2/NewProjectModal';
import { useIsMobile } from '@/hooks/use-mobile';

export function ProjectsViewV2() {
    const supabase = createClient();
    const isMobile = useIsMobile();
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'active' | 'completed'>('active');
    const [isBrainDumpOpen, setIsBrainDumpOpen] = useState(false);
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const fetchData = async () => {
        setLoading(true);
        const [projRes, taskRes, secRes] = await Promise.all([
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            supabase.from('tasks').select('*'),
            supabase.from('sections').select('*')
        ]);

        if (projRes.error) console.error('Projects Error', projRes.error);

        setProjects((projRes.data as unknown as Project[]) || []);
        setTasks((taskRes.data as unknown as Task[]) || []);
        setSections((secRes.data as unknown as Section[]) || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleToggleTask = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        const completedAt = newStatus === 'Done' ? new Date().toISOString() : null;

        // Optimistic
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus, completed_at: completedAt } : t));

        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus, completed_at: completedAt })
            .eq('id', task.id);

        if (error) {
            toast.error('Update failed');
            fetchData();
        } else {
            // Check project completion
            const projectTasks = tasks.filter(t => t.project_id === task.project_id);
            const isProjectDone = projectTasks.every(t => t.id === task.id ? newStatus === 'Done' : t.status === 'Done');

            if (isProjectDone && newStatus === 'Done') {
                toast.success('Project tasks complete!', {
                    action: {
                        label: 'Mark Project Completed',
                        onClick: () => handleCompleteProject(task.project_id)
                    }
                });
            }
        }
    };

    const handleAddProject = () => {
        setIsNewProjectOpen(true);
    };

    const handleProjectCreated = (newProject: Project) => {
        setProjects(prev => [newProject, ...prev]);
        setIsNewProjectOpen(false);
    };

    const handleDeleteProject = async (projectId: string) => {
        // Optimistic update
        setProjects(prev => prev.filter(p => p.id !== projectId));

        // Delete tasks and sections first (if no cascade) - Supabase usually cascades if configured, 
        // but let's be safe or assume cascade is on. Ideally we check schema.
        // Assuming cascade for now based on standard setup, or we'll get an error.

        const { error } = await supabase.from('projects').delete().eq('id', projectId);

        if (error) {
            console.error('Delete project error:', error);
            toast.error('Failed to delete project');
            fetchData(); // Revert
        } else {
            toast.success('Project deleted');
        }
    };

    const handleCompleteProject = async (projectId: string) => {
        const { error } = await supabase
            .from('projects')
            .update({ status: 'Completed' })
            .eq('id', projectId);

        if (error) {
            toast.error('Failed to complete project');
        } else {
            toast.success('Project moved to Completed');
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'Completed' } : p));
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);

        if (error) {
            toast.error('Failed to delete task');
        } else {
            toast.success('Task deleted');
            setTasks(prev => prev.filter(t => t.id !== taskId));
        }
    };

    // Filter Logic
    const filteredProjects = projects.filter(p => {
        // Hide "Personal" project from main view
        if (p.name === 'Personal') return false;

        if (view === 'active') {
            return p.status === 'In Progress';
        } else {
            return p.status === 'Completed';
        }
    });

    if (loading) {
        return (
            <div className="h-[calc(100vh-100px)] w-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl md:text-4xl font-bold font-serif tracking-tight">Projects</h1>
                    <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-base">Manage and track your projects</p>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    <Button onClick={handleAddProject} variant="outline" className="gap-2 bg-white/5 hover:bg-white/10 border-white/10 text-zinc-200 flex-1 md:flex-initial h-11 md:h-10 text-sm active:scale-[0.97] transition-transform">
                        <Plus className="w-4 h-4" />
                        New Project
                    </Button>

                    <Button
                        onClick={() => setIsBrainDumpOpen(true)}
                        className="bg-white text-black hover:bg-white/90 font-medium flex-1 md:flex-initial h-11 md:h-10 text-sm active:scale-[0.97] transition-transform"
                    >
                        <Brain className="w-4 h-4 mr-2 md:hidden" />
                        <Plus className="w-4 h-4 mr-2 hidden md:inline" />
                        <span className="md:hidden">Brain Dump</span>
                        <span className="hidden md:inline">Add Things To Do</span>
                    </Button>
                </div>
            </div>

            {/* Project List */}
            <div className="space-y-6">
                {filteredProjects.length > 0 ? (
                    filteredProjects.map(project => {
                        const projectTasks = tasks.filter(t => t.project_id === project.id);
                        const projectSections = sections.filter(s => s.project_id === project.id);

                        return (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                tasks={projectTasks}
                                sections={projectSections}
                                onToggleTask={handleToggleTask}
                                onCompleteProject={handleCompleteProject}
                                onDeleteProject={handleDeleteProject}
                                onEditTask={setSelectedTask}
                                onUpdateProject={(updated) => setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))}
                                onUpdateSection={(updated) => setSections(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))}
                                onAddSection={(newSection) => setSections(prev => [...prev, newSection])}
                                onDeleteSection={(sectionId) => {
                                    setSections(prev => prev.filter(s => s.id !== sectionId));
                                    setTasks(prev => prev.map(t => t.section_id === sectionId ? { ...t, section_id: null } : t));
                                }}
                                onAddTask={(newTask) => setTasks(prev => [...prev, newTask])}
                            />
                        );
                    })
                ) : (
                    <Card className="p-12 bg-card/20 border-white/5 border-dashed flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                            <Plus className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-white/80">
                            {view === 'active' ? 'No active projects' : 'No completed projects'}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            {view === 'active' ? 'Ready to start something new? Click the "Add Things To Do" button above.' : 'Projects you finish will appear here.'}
                        </p>
                    </Card>
                )}
            </div>

            <BrainDumpModal
                isOpen={isBrainDumpOpen}
                onClose={() => setIsBrainDumpOpen(false)}
                projects={projects}
                sections={sections}
                onRefresh={fetchData}
            />

            <NewProjectModal
                isOpen={isNewProjectOpen}
                onClose={() => setIsNewProjectOpen(false)}
                onProjectCreated={handleProjectCreated}
            />

            <TaskDetailModal
                task={selectedTask}
                open={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                projects={projects}
                sections={sections}
                onUpdate={fetchData}
                onDelete={handleDeleteTask}
            />
        </div >
    );
}
