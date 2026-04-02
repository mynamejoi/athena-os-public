import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowRight, Trophy, Target, CheckCircle, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Goal {
    id: string;
    title: string;
    category: 'Health' | 'Growth' | 'Athena' | 'Work';
    target_value: number;
    current_value: number;
    unit: string;
    linked_metric: string;
    yearly_goal_id?: string;
    // For Yearly Goals
    year?: number;
    // For Monthly Goals
    month?: string; 
}

interface UnifiedGoalsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // Context needed for creating new goals
    currentMonthDate?: Date; // e.g. from MonthView
    currentYear?: number;    // e.g. from YearView or derived
    // Optional goal to edit. If passed, type is locked.
    goalToEdit?: Goal | null;
    // Optional preset type if opened from a specific button (e.g. "+" next to Monthly list vs "+" next to Yearly list)
    defaultType?: 'yearly' | 'monthly'; 
    onSave: () => void;
}

export function UnifiedGoalsModal({ 
    isOpen, 
    onClose, 
    currentMonthDate, 
    currentYear = new Date().getFullYear(),
    goalToEdit, 
    defaultType = 'monthly',
    onSave 
}: UnifiedGoalsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    
    // Core state
    const [goalType, setGoalType] = useState<'yearly' | 'monthly'>(defaultType);
    const [isEditing, setIsEditing] = useState(false);

    // Form data
    const [formData, setFormData] = useState({
        title: '',
        category: 'Health' as 'Health' | 'Growth' | 'Athena' | 'Work',
        target_value: '1',
        current_value: '0',
        unit: '',
        linked_metric: 'none',
        yearly_goal_id: ''
    });

    useEffect(() => {
        if (isOpen) {
            if (goalToEdit) {
                setIsEditing(true);
                // Determine type based on presence of 'year' vs 'month' field
                // or if it has a yearly_goal_id it's definitely monthly.
                const isYearly = ('year' in goalToEdit) || (!goalToEdit.month && !goalToEdit.yearly_goal_id);
                setGoalType(isYearly ? 'yearly' : 'monthly');
                
                setFormData({
                    title: goalToEdit.title || '',
                    category: goalToEdit.category || 'Health',
                    target_value: goalToEdit.target_value?.toString() || '1',
                    current_value: goalToEdit.current_value?.toString() || '0',
                    unit: goalToEdit.unit || '',
                    linked_metric: goalToEdit.linked_metric || 'none',
                    yearly_goal_id: goalToEdit.yearly_goal_id || ''
                });
            } else {
                setIsEditing(false);
                setGoalType(defaultType);
                setFormData({
                    title: '',
                    category: 'Health',
                    target_value: '1',
                    current_value: '0',
                    unit: '',
                    linked_metric: 'none',
                    yearly_goal_id: ''
                });
            }
        }
    }, [isOpen, goalToEdit, defaultType]);

    const handleMetricChange = (val: string) => {
        let title = formData.title;
        let unit = formData.unit;
        let target = formData.target_value;

        // Custom defaults based on selection
        if (val === 'books_read') {
            title = goalType === 'yearly' ? 'Read X Books' : 'Read 1 Book';
            unit = 'Books';
            target = goalType === 'yearly' ? '24' : '1';
        } else if (val === 'gym_sessions') {
            title = 'Go to the Gym';
            unit = 'Sessions';
            target = goalType === 'yearly' ? '150' : '12';
        } else if (val === 'project_streak') {
            title = 'Deep Work Sessions';
            unit = 'Sessions';
            target = goalType === 'yearly' ? '200' : '15';
        } else if (val === 'avg_recovery') {
            title = 'Avg Recovery 70%+';
            unit = '%';
            target = '70';
        } else if (val === 'avg_sleep') {
            title = 'Avg Sleep 85%+';
            unit = '%';
            target = '85';
        } else if (val === 'avg_strain') {
            title = 'Avg Strain 12+';
            unit = '';
            target = '12';
        } else if (val === 'perfect_days') {
            title = 'Perfect Days';
            unit = 'Days';
            target = goalType === 'yearly' ? '200' : '20';
        } else if (val === 'workout_count') {
            title = goalType === 'yearly' ? 'Complete 200 Workouts' : 'Complete 16 Workouts';
            unit = 'Workouts';
            target = goalType === 'yearly' ? '200' : '16';
        }

        setFormData(prev => ({
            ...prev,
            linked_metric: val,
            title,
            unit,
            target_value: target
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            // Determine endpoints and payloads based on goalType
            const isYearly = goalType === 'yearly';
            
            const url = isEditing 
                ? (isYearly ? `/api/goals/year/${goalToEdit?.id}` : `/api/goals/${goalToEdit?.id}`)
                : (isYearly ? '/api/goals/year' : '/api/goals');
                
            const method = isEditing ? 'PATCH' : 'POST';

            let payload: any = {
                title: formData.title,
                category: formData.category,
                target_value: parseFloat(formData.target_value),
                current_value: parseFloat(formData.current_value),
                unit: formData.unit,
                linked_metric: formData.linked_metric,
                status: 'active'
            };

            if (isYearly) {
                payload.year = isEditing ? goalToEdit?.year : currentYear;
            } else {
                // Monthly
                if (!isEditing && currentMonthDate) {
                    payload.month = `${currentMonthDate.getFullYear()}-${String(currentMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                }
                // Monthly doesn't update 'status' natively on standard patch usually, but it shouldn't hurt.
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to save goal');
            }

            toast.success(isEditing ? 'Goal updated' : 'Goal created');
            onSave();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Something went wrong');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!goalToEdit) return;
        if (!confirm('Are you sure you want to delete this goal?')) return;

        setIsLoading(true);
        try {
            const url = goalType === 'yearly' ? `/api/goals/year/${goalToEdit.id}` : `/api/goals/${goalToEdit.id}`;
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            toast.success('Goal deleted');
            onSave();
            onClose();
        } catch (error) {
            toast.error('Failed to delete goal');
        } finally {
            setIsLoading(false);
        }
    };

    const handleForwardToNextMonth = async () => {
        if (!goalToEdit || goalType === 'yearly') return;
        if (!confirm('This will duplicate the goal into the next month and close this one early. Confirm?')) return;

        setIsLoading(true);
        try {
            const res = await fetch(`/api/goals/${goalToEdit.id}/rollover`, { method: 'POST' });
            if (!res.ok) {
                 const err = await res.json();
                 throw new Error(err.error || 'Failed to roll over');
            }
            toast.success('Goal forwarded to next month!');
            onSave();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Failed to forward goal');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-athena-panel border-athena-border text-zinc-100 sm:max-w-[425px]">
                <DialogHeader>
                    {/* Goal Type Toggle (Only if NOT editing) */}
                    {!isEditing && (
                        <div className="flex justify-center mb-4">
                            <div className="flex bg-white/5 p-1 rounded-full border border-athena-border/50 relative">
                                {/* Active slider background */}
                                <div 
                                    className={cn(
                                        "absolute top-1 bottom-1 w-[calc(50%-4px)] bg-athena-gold/20 rounded-full transition-transform duration-300 ease-in-out border border-athena-gold/30",
                                        goalType === 'monthly' ? "translate-x-[100%]" : "translate-x-0"
                                    )}
                                />
                                
                                <button
                                    type="button"
                                    onClick={() => setGoalType('yearly')}
                                    className={cn(
                                        "relative z-10 flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-full transition-colors w-32 justify-center",
                                        goalType === 'yearly' ? "text-athena-gold" : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    <Trophy className="w-3.5 h-3.5" />
                                    Yearly
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGoalType('monthly')}
                                    className={cn(
                                        "relative z-10 flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-full transition-colors w-32 justify-center",
                                        goalType === 'monthly' ? "text-athena-gold" : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    <Target className="w-3.5 h-3.5" />
                                    Monthly
                                </button>
                            </div>
                        </div>
                    )}

                    <DialogTitle className="text-xl font-serif text-athena-gold flex items-center justify-center gap-2 mt-2">
                        {isEditing
                            ? (goalType === 'yearly' ? 'Edit Yearly Goal' : 'Edit Monthly Goal')
                            : (goalType === 'yearly' ? 'New Yearly Goal' : 'New Monthly Goal')
                        }
                    </DialogTitle>
                     {goalType === 'yearly' && !isEditing && (
                        <p className="text-center text-xs text-athena-text-muted mt-1 leading-relaxed">
                            Yearly goals are automatically split into monthly targets to keep you on track.
                        </p>
                    )}
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div className="space-y-2">
                        <Label>Title {formData.yearly_goal_id && <span className="text-xs text-athena-gold ml-2">(Linked to Yearly Goal)</span>}</Label>
                        <Input
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder={goalType === 'yearly' ? "e.g. Read 24 Books" : "e.g. Attend a Seminar"}
                            required
                            disabled={!!formData.yearly_goal_id}
                            className="bg-white/5 border-athena-border focus-visible:ring-athena-gold/50"
                        />
                    </div>

                    {/* Goal Style: Trackable vs Yes/No */}
                    {!formData.yearly_goal_id && formData.linked_metric === 'none' && (
                        <div className="flex items-center gap-3">
                            <Label className="text-xs text-athena-text-muted">Style</Label>
                            <div className="flex bg-white/5 p-0.5 rounded-lg border border-athena-border/50 text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, unit: '', target_value: '1' }))}
                                    className={cn(
                                        "px-3 py-1 rounded-md transition-colors min-h-[44px]",
                                        formData.unit !== 'yes_no' ? "bg-athena-gold/20 text-athena-gold" : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    Trackable
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, unit: 'yes_no', target_value: '1', current_value: '0' }))}
                                    className={cn(
                                        "px-3 py-1 rounded-md transition-colors min-h-[44px]",
                                        formData.unit === 'yes_no' ? "bg-athena-gold/20 text-athena-gold" : "text-zinc-400 hover:text-zinc-200"
                                    )}
                                >
                                    Yes / No
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select
                                value={formData.category}
                                onValueChange={val => setFormData({ ...formData, category: val as any })}
                                disabled={!!formData.yearly_goal_id}
                            >
                                <SelectTrigger className="bg-white/5 border-athena-border disabled:opacity-50">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-athena-panel border-athena-border">
                                    <SelectItem value="Health">Health</SelectItem>
                                    <SelectItem value="Growth">Growth</SelectItem>
                                    <SelectItem value="Athena">Athena</SelectItem>
                                    <SelectItem value="Work">Work</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Auto-Track</Label>
                            <Select
                                value={formData.linked_metric}
                                onValueChange={handleMetricChange}
                                disabled={!!formData.yearly_goal_id}
                            >
                                <SelectTrigger className="bg-white/5 border-athena-border disabled:opacity-50">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-athena-panel border-athena-border">
                                    <SelectItem value="none">Manual</SelectItem>
                                    <SelectItem value="gym_sessions">Gym Sessions</SelectItem>
                                    <SelectItem value="project_streak">Deep Work Sessions</SelectItem>
                                    <SelectItem value="books_read">Books Read</SelectItem>
                                    <SelectItem value="perfect_days">Perfect Days (100%)</SelectItem>
                                    <SelectItem value="workout_count">Total Workouts</SelectItem>
                                    <SelectItem value="avg_recovery">Avg Recovery Score</SelectItem>
                                    <SelectItem value="avg_sleep">Avg Sleep Score</SelectItem>
                                    <SelectItem value="avg_strain">Avg Strain</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {formData.unit !== 'yes_no' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Target</Label>
                                <Input
                                    type="number"
                                    min={goalType === 'monthly' ? "1" : "any"}
                                    step="any"
                                    value={formData.target_value}
                                    onChange={e => setFormData({ ...formData, target_value: e.target.value })}
                                    required
                                    disabled={!!formData.yearly_goal_id}
                                    className="bg-white/5 border-athena-border disabled:opacity-50"
                                />
                                {formData.linked_metric === 'books_read' && (
                                    <p className="text-[10px] text-athena-text-muted mt-1">
                                        Target amount of whole books.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Unit</Label>
                                <Input
                                    value={formData.unit}
                                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    placeholder="e.g. sessions or %"
                                    disabled={!!formData.yearly_goal_id}
                                    className="bg-white/5 border-athena-border disabled:opacity-50"
                                />
                            </div>
                        </div>
                    )}

                    {formData.unit === 'yes_no' && formData.linked_metric === 'none' && (
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, current_value: prev.current_value === '1' ? '0' : '1' }))}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors",
                                    formData.current_value === '1'
                                        ? "border-athena-green/50 bg-athena-green/10"
                                        : "border-athena-border bg-white/5 hover:border-athena-border/80"
                                )}
                            >
                                {formData.current_value === '1'
                                    ? <CheckCircle className="w-5 h-5 text-athena-green" />
                                    : <Circle className="w-5 h-5 text-athena-text-muted" />
                                }
                                <span className={cn("text-sm", formData.current_value === '1' ? "text-athena-green" : "text-athena-text-muted")}>
                                    {formData.current_value === '1' ? 'Completed' : 'Not yet'}
                                </span>
                            </button>
                        </div>
                    )}

                    {formData.unit !== 'yes_no' && formData.linked_metric === 'none' && (
                        <div className="space-y-2">
                            <Label>Current Progress</Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 w-11 p-0"
                                    onClick={() => setFormData(prev => ({ ...prev, current_value: Math.max(0, parseFloat(prev.current_value) - 1).toString() }))}
                                >
                                    -
                                </Button>
                                <Input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={formData.current_value}
                                    onChange={e => setFormData({ ...formData, current_value: e.target.value })}
                                    className="bg-white/5 border-athena-border text-center"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 w-11 p-0"
                                    onClick={() => setFormData(prev => ({ ...prev, current_value: (parseFloat(prev.current_value) + 1).toString() }))}
                                >
                                    +
                                </Button>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="mt-6 gap-2">
                        {isEditing && (
                            <div className="flex gap-2 mr-auto">
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={isLoading}
                                >
                                    Delete
                                </Button>
                                
                                {/* Push to next month button ONLY for standalone monthlies */}
                                {goalType === 'monthly' && !formData.yearly_goal_id && (
                                    <>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-athena-gold text-athena-gold hover:bg-athena-gold/10 whitespace-nowrap hidden sm:flex"
                                            onClick={handleForwardToNextMonth}
                                            disabled={isLoading}
                                            title="Forward to next month"
                                        >
                                            Push to Next Month
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="border-athena-gold text-athena-gold hover:bg-athena-gold/10 sm:hidden"
                                            onClick={handleForwardToNextMonth}
                                            disabled={isLoading}
                                            title="Forward to next month"
                                        >
                                            Push <ArrowRight className="ml-1 w-3 h-3" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                        {!isEditing && <div className="mr-auto"></div>}
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-athena-gold text-black hover:bg-athena-gold/90 font-serif"
                        >
                            {isLoading && <Loader2 className="animate-spin w-4 h-4 mr-2" />}
                            Save Goal
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
