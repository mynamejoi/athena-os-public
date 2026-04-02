'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AthenaPlannerProps {
    isOpen: boolean;
    onClose: () => void;
    onTasksCreated?: () => void;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface PendingTaskGroup {
    projectName: string;
    taskCount: number;
}

interface PendingTasksData {
    tasks: any[];
    newProjects: Array<{ name: string; description: string }>;
    groups: PendingTaskGroup[];
    totalCount: number;
}

function parseStructuredContent(content: string | undefined | null) {
    if (!content) return [<span key="empty" className="text-[13px] text-athena-text-muted">...</span>];

    // Pre-process: remove code fence blocks (``` ... ```)
    const cleaned = content.replace(/```\w*\n?/g, '').replace(/```/g, '');

    const lines = cleaned.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (const line of lines) {
        let trimmed = line.trim();

        // Strip markdown bold: **text** -> text
        trimmed = trimmed.replace(/\*\*(.+?)\*\*/g, '$1');
        // Strip brackets: [text] -> text
        trimmed = trimmed.replace(/^\[(.+)\]$/, '$1');

        // Section lines: "Section: Name (date range)" — check FIRST
        const sectionMatch = trimmed.match(/^Section\s*[:]\s*(.+)$/i);
        if (sectionMatch) {
            elements.push(
                <div key={key++} className="flex items-center gap-2 mt-3 mb-1 ml-2">
                    <div className="w-1 h-4 rounded-full bg-athena-gold/40" />
                    <p className="text-[10px] uppercase tracking-[0.2em] text-athena-gold/80 font-bold">
                        {sectionMatch[1]}
                    </p>
                </div>
            );
            continue;
        }

        // Phase lines: "Phase: Name (date range)"
        const phaseMatch = trimmed.match(/^Phase\s*\d*\s*[:]\s*(.+)$/i);
        if (phaseMatch) {
            elements.push(
                <p key={key++} className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mt-3 mb-1 ml-2">
                    {trimmed}
                </p>
            );
            continue;
        }

        // Project name: short lines with title case or all caps, not starting with - or known labels
        const isProjectHeader = trimmed.length > 2 && trimmed.length < 60 &&
            !trimmed.startsWith('-') && !trimmed.startsWith('Phase') &&
            !trimmed.startsWith('Section') && !trimmed.startsWith('Step') &&
            !trimmed.startsWith('Sprint') && !trimmed.startsWith('Want') &&
            !trimmed.startsWith('Got') && !trimmed.startsWith('Here') &&
            !trimmed.includes('|') &&
            !trimmed.endsWith('.') && !trimmed.endsWith('?') && !trimmed.endsWith('!') &&
            !trimmed.endsWith(':') &&
            (/^[A-Z][A-Za-z\s—–\-()]+$/.test(trimmed) || trimmed === trimmed.toUpperCase());
        if (isProjectHeader) {
            elements.push(
                <h4 key={key++} className="text-[15px] font-serif text-athena-gold mt-4 mb-1 first:mt-0">
                    {trimmed}
                </h4>
            );
            continue;
        }

        // Task lines with -- or - prefix, possibly with pipe separators
        if (trimmed.startsWith('--') || trimmed.startsWith('- ')) {
            const taskText = trimmed.replace(/^--\s*/, '').replace(/^-\s*/, '');

            // Check for pipe-separated format: "Task name | effort | date(s)"
            const parts = taskText.split('|').map(p => p.trim());
            if (parts.length >= 3) {
                const taskName = parts[0];
                const effort = parts[1];
                const dateStr = parts.slice(2).join(' | ');

                // Effort badge colors
                const effortColor = effort === 'large' ? 'text-red-400 bg-red-400/10' :
                    effort === 'medium' ? 'text-athena-gold bg-athena-gold/10' :
                    effort === 'short' ? 'text-blue-400 bg-blue-400/10' :
                    'text-athena-green bg-athena-green/10';

                elements.push(
                    <div key={key++} className="flex items-center gap-2 ml-2 py-1">
                        <span className="text-athena-gold text-[10px] shrink-0">--</span>
                        <span className="text-[13px] text-athena-text-primary flex-1">{taskName}</span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${effortColor} shrink-0`}>{effort}</span>
                        <span className="text-[11px] text-athena-text-muted shrink-0">{dateStr}</span>
                    </div>
                );
            } else {
                elements.push(
                    <div key={key++} className="text-[13px] text-athena-text-primary leading-relaxed flex items-start gap-2 ml-2">
                        <span className="text-athena-gold mt-0.5 text-[10px] shrink-0">--</span>
                        <span>{taskText}</span>
                    </div>
                );
            }
            continue;
        }

        // Empty lines
        if (trimmed === '') {
            elements.push(<div key={key++} className="h-2" />);
            continue;
        }

        // Regular text
        elements.push(
            <p key={key++} className="text-[13px] text-athena-text-primary leading-relaxed">
                {trimmed}
            </p>
        );
    }

    return elements;
}

export function AthenaPlanner({ isOpen, onClose, onTasksCreated }: AthenaPlannerProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<PendingTasksData | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading, pendingTasks]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Reset on close
    const handleClose = () => {
        onClose();
        setTimeout(() => {
            setMessages([]);
            setInput('');
            setPendingTasks(null);
            setIsLoading(false);
            setIsCreating(false);
        }, 300);
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        // If pending tasks are showing, clear them so the user can continue the conversation
        if (pendingTasks) {
            setPendingTasks(null);
        }

        const userMessage: ChatMessage = { role: 'user', content: trimmed };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: updatedMessages }),
            });

            if (!res.ok) throw new Error('Failed to get response');

            const data = await res.json();

            // Check if response contains tasks ready for creation
            if (data.tasks && data.tasks.length > 0) {
                // Client-side fix: extract project name from the assistant's plan text
                // The plan header (e.g., "Project Athena") is the source of truth
                const assistantPlan = updatedMessages.filter(m => m.role === 'assistant').map(m => m.content).join('\n');
                const taskProjectName = data.tasks[0]?.projectName;
                // Check if the plan text contains a DIFFERENT project name as a header
                // than what's in the JSON tasks
                if (taskProjectName) {
                    const planLines = assistantPlan.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                    for (const line of planLines) {
                        // A project header is a line that isn't a task (no leading dash/number)
                        // and doesn't match common non-header patterns
                        if (!line.startsWith('-') && !line.startsWith('--') && !line.match(/^(want|you|note|section|phase)/i) && !line.includes('|')) {
                            // Check if this line looks like a project name AND is different from the task project
                            if (line.toLowerCase() !== taskProjectName.toLowerCase() && line.length < 50) {
                                // This is likely the correct project header — override tasks
                                for (const task of data.tasks) {
                                    task.projectName = line;
                                }
                                break;
                            }
                        }
                    }
                }

                // Don't show the JSON block as a message — just show the task confirmation
                const groups: Record<string, number> = {};
                for (const task of data.tasks) {
                    const name = task.projectName || 'Unassigned';
                    groups[name] = (groups[name] || 0) + 1;
                }
                setPendingTasks({
                    tasks: data.tasks,
                    newProjects: data.newProjects || [],
                    groups: Object.entries(groups).map(([projectName, taskCount]) => ({ projectName, taskCount })),
                    totalCount: data.tasks.length,
                });
            } else {
                // Normal response — show as message
                const assistantMessage: ChatMessage = { role: 'assistant', content: data.response || data.message || '' };
                setMessages([...updatedMessages, assistantMessage]);
            }
        } catch (err) {
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: 'Something went wrong. Could you try again?',
            };
            setMessages([...updatedMessages, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateTasks = async () => {
        if (!pendingTasks) return;
        setIsCreating(true);

        try {
            const res = await fetch('/api/planner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', tasks: pendingTasks.tasks, newProjects: pendingTasks.newProjects || [] }),
            });

            if (!res.ok) throw new Error('Failed to create tasks');

            await res.json();
            toast.success(`${pendingTasks.totalCount} tasks created`);
            onTasksCreated?.();
            handleClose();
        } catch (err) {
            toast.error('Failed to create tasks. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const greeting = "What are you working on? I have context on your projects, schedule, and recovery data.";

    if (typeof window === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[100] bg-athena-bg/95 backdrop-blur-xl flex flex-col pt-[env(safe-area-inset-top)]"
                    style={{ fontFamily: "'Geist', 'SF Pro Display', -apple-system, sans-serif" }}
                >
                    {/* Ambient background */}
                    <div className="absolute inset-0 z-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold/5 rounded-full blur-[150px]" />
                    </div>

                    {/* Header */}
                    <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-athena-border">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-athena-gold" />
                            <h1 className="text-lg font-serif text-athena-gold">Athena Planner</h1>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2 rounded-lg text-athena-text-warm hover:text-athena-gold hover:bg-athena-gold/10 border border-athena-border hover:border-athena-gold/30 transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Chat area */}
                    <div
                        ref={scrollRef}
                        className="relative z-10 flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-4 scrollbar-thin scrollbar-thumb-athena-border scrollbar-track-transparent"
                    >
                        <div className="max-w-2xl mx-auto space-y-4">
                            {/* Initial greeting */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4 }}
                                className="bg-white/[0.03] border border-athena-border rounded-xl p-4"
                            >
                                <p className="text-[13px] text-athena-text-primary leading-relaxed">{greeting}</p>
                            </motion.div>

                            {/* Messages */}
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className={msg.role === 'user' ? 'flex justify-end' : ''}
                                >
                                    <div
                                        className={
                                            msg.role === 'user'
                                                ? 'bg-athena-gold/10 border border-athena-gold/20 rounded-xl p-4 max-w-[85%]'
                                                : 'bg-white/[0.03] border border-athena-border rounded-xl p-4'
                                        }
                                    >
                                        {msg.role === 'assistant' ? (
                                            <div className="space-y-1">
                                                {parseStructuredContent(msg.content)}
                                            </div>
                                        ) : (
                                            <p className="text-[13px] text-athena-text-primary leading-relaxed whitespace-pre-wrap">
                                                {msg.content}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {/* Loading indicator */}
                            {isLoading && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="flex items-center gap-2 px-4 py-3"
                                >
                                    <div className="w-2 h-2 rounded-full bg-athena-gold animate-pulse" />
                                    <span className="text-xs text-athena-text-muted">Athena is thinking...</span>
                                </motion.div>
                            )}

                            {/* Pending tasks confirmation card */}
                            {pendingTasks && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="bg-white/[0.03] border border-athena-gold/30 rounded-xl p-5 space-y-4"
                                >
                                    <div>
                                        <h3 className="text-[9px] uppercase tracking-[0.25em] text-athena-text-muted font-bold mb-2">
                                            Tasks Ready to Create
                                        </h3>
                                        <p className="text-[15px] font-serif text-athena-gold">
                                            {pendingTasks.totalCount} task{pendingTasks.totalCount !== 1 ? 's' : ''} across {pendingTasks.groups.length} project{pendingTasks.groups.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>

                                    {pendingTasks.newProjects && pendingTasks.newProjects.length > 0 && (
                                        <div className="text-[11px] text-athena-gold/70 mb-2">
                                            Creating {pendingTasks.newProjects.length} new project{pendingTasks.newProjects.length > 1 ? 's' : ''}
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        {pendingTasks.groups.map((group, i) => (
                                            <div key={i} className="text-[13px] text-athena-text-primary flex items-center gap-2">
                                                <span className="text-athena-gold text-[10px]">--</span>
                                                <span className="font-medium">{group.projectName}</span>
                                                <span className="text-athena-text-muted">({group.taskCount} task{group.taskCount !== 1 ? 's' : ''})</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-3 pt-2">
                                        <button
                                            onClick={handleCreateTasks}
                                            disabled={isCreating}
                                            className="px-4 py-2 rounded-lg bg-athena-gold/20 text-athena-gold text-xs font-sans font-semibold hover:bg-athena-gold/30 border border-athena-gold/30 transition-all disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
                                        >
                                            {isCreating ? (
                                                <>
                                                    <Loader2 size={12} className="animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                'Create Tasks'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setPendingTasks(null)}
                                            disabled={isCreating}
                                            className="px-4 py-2 rounded-lg text-xs font-sans text-athena-text-muted border border-athena-border hover:text-athena-text-primary hover:border-athena-border transition-all disabled:opacity-50"
                                        >
                                            Go Back
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* Input area */}
                    <div className="relative z-10 bg-athena-panel border-t border-athena-border px-4 md:px-6 py-4">
                        <div className="max-w-2xl mx-auto flex items-end gap-3">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Tell Athena what you're working on..."
                                rows={1}
                                className="flex-1 bg-athena-bg/50 border border-athena-border rounded-xl px-4 py-3 text-base md:text-[13px] text-athena-text-primary placeholder:text-athena-text-muted/40 resize-none focus:outline-none focus:ring-1 focus:ring-athena-gold/40 focus:border-athena-gold/40 transition-all"
                                style={{
                                    minHeight: '44px',
                                    maxHeight: '120px',
                                    height: 'auto',
                                    overflow: input.split('\n').length > 3 ? 'auto' : 'hidden',
                                }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="shrink-0 p-3 rounded-xl bg-athena-gold text-black hover:bg-athena-gold-dim transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
