"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BrainDumpStep1 } from './BrainDumpStep1';
import { BrainDumpStep2 } from './BrainDumpStep2';
import { BrainDumpStep3 } from './BrainDumpStep3';
import { Project, Section } from '@/types/productivity';

interface BrainDumpModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    sections: Section[];
    onRefresh: () => void;
}

export type ParsedTask = {
    id: string; // temp id
    title: string;
    projectId: string;
    sectionId?: string;
    needsPlanning: boolean;
    start_date?: string;
    end_date?: string | null;
    hard_deadline?: string | null;
    effort?: 'quick' | 'short' | 'medium' | 'large';
    reasoning?: string;
    subtasks?: ParsedTask[]; // For hierarchy in Step 3
    dependencies?: string[]; // IDs
    // AI Reason / Breakdown Fields
    parent_task_id?: string;
    is_epic?: boolean;
    phase?: string;
    phase_order?: number;
    ai_generated?: boolean;
    ai_description?: string;
};

import { StepIndicator } from './BrainDumpTheme';

export function BrainDumpModal({ isOpen, onClose, projects, sections, onRefresh }: BrainDumpModalProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [dumpText, setDumpText] = useState('');
    const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);

    const steps = [
        { label: "Brain Dump", sub: "Capture everything" },
        { label: "Triage", sub: "Refine & plan" },
        { label: "Review", sub: "Select & apply" },
    ];

    const handleStep1Complete = (text: string) => {
        setDumpText(text);
        setStep(2);
    };

    const handleStep2Complete = (tasks: ParsedTask[]) => {
        setParsedTasks(tasks);
        setStep(3);
    };

    const handleStep3Complete = () => {
        onRefresh();
        handleClose();
    };

    const handleClose = () => {
        onClose();
        // Reset state after transition
        setTimeout(() => {
            setStep(1);
            setDumpText('');
            setParsedTasks([]);
        }, 300);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                className="max-w-5xl h-[85dvh] md:h-[65vh] flex flex-col p-0 gap-0 bg-[#020204] border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8),_0_0_0_1px_rgba(255,255,255,0.03),_inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden sm:rounded-none"
                style={{ fontFamily: "'Geist', 'SF Pro Display', -apple-system, sans-serif", borderRadius: 0 }}
            >
                {/* Ambient Background to match Projects 2.0 */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-athena-gold opacity-[0.05] rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 flex flex-col w-full h-full">
                    <DialogTitle className="sr-only">Brain Dump Workflow</DialogTitle>

                    <StepIndicator current={step - 1} steps={steps} />
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 28px 0" }} />

                    <div className="flex-1 overflow-hidden">
                        {step === 1 && <BrainDumpStep1 onNext={handleStep1Complete} />}
                        {step === 2 && (
                            <BrainDumpStep2
                                text={dumpText}
                                existingTasks={parsedTasks}
                                projects={projects}
                                sections={sections}
                                onBack={() => setStep(1)}
                                onNext={handleStep2Complete}
                            />
                        )}
                        {step === 3 && (
                            <BrainDumpStep3
                                tasks={parsedTasks}
                                projects={projects}
                                sections={sections}
                                onBack={() => setStep(2)}
                                onComplete={handleStep3Complete}
                            />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
