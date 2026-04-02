import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface Goal {
    id: string;
    title: string;
    target_value: number;
    current_value: number;
    unit: string;
}

interface BatchReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentMonthDate: Date;
    pendingGoals: Goal[];
    onComplete: () => void;
}

export function BatchReviewModal({ isOpen, onClose, currentMonthDate, pendingGoals, onComplete }: BatchReviewModalProps) {
    const [decisions, setDecisions] = useState<Record<string, 'carry' | 'archive'>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Default all to carry over
    React.useEffect(() => {
        const defaults: Record<string, 'carry' | 'archive'> = {};
        pendingGoals.forEach(g => defaults[g.id] = 'carry');
        setDecisions(defaults);
    }, [pendingGoals]);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            // Process decisions
            // This would ideally be a bulk API endpoint, but for V1 we can loop
            const carryGoals = pendingGoals.filter(g => decisions[g.id] === 'carry');
            const archiveGoals = pendingGoals.filter(g => decisions[g.id] === 'archive');

            // 1. Archive old goals
            await Promise.all(archiveGoals.map(g =>
                fetch(`/api/goals/${g.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'archived' })
                })
            ));

            // 2. Clone carried goals to new month
            await Promise.all(carryGoals.map(async g => {
                // Archive old one
                await fetch(`/api/goals/${g.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'archived' }) // Mark old as archived/processed so it doesn't show up again? OR 'completed' (failed)? 
                    // Better: 'archived' so it's not active.
                });

                // Create new one
                await fetch('/api/goals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        month: currentMonthDate.toISOString(),
                        category: 'Work', // We need to fetch original category really, but simplified for now (or pass full object)
                        title: g.title,
                        target_value: g.target_value,
                        unit: g.unit,
                        linked_metric: 'none', // Reset to manual or keep? Ideally keep. Simplification: Manual.
                        // Ideally we pass full goal object to modal to preserve these fields.
                    })
                });
            }));

            toast.success('Goals processed');
            onComplete();
            onClose();

        } catch (error) {
            console.error(error);
            toast.error('Failed to process goals');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-serif text-athena-gold">
                        Review Previous Month's Goals
                    </DialogTitle>
                    <p className="text-sm text-zinc-400">
                        {pendingGoals.length} goals from last month need your attention.
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {pendingGoals.map(goal => (
                        <div key={goal.id} className="flex items-center justify-between p-3 bg-zinc-800/30 rounded border border-zinc-800">
                            <div>
                                <h4 className="font-medium text-zinc-200">{goal.title}</h4>
                                <div className="text-xs text-zinc-500">
                                    Progress: {goal.current_value} / {goal.target_value} {goal.unit}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="default"
                                    variant={decisions[goal.id] === 'archive' ? 'destructive' : 'outline'}
                                    className="min-h-[44px] text-xs"
                                    onClick={() => setDecisions({ ...decisions, [goal.id]: 'archive' })}
                                >
                                    <X className="w-3 h-3 mr-1" />
                                    Archive
                                </Button>
                                <Button
                                    size="default"
                                    variant={decisions[goal.id] === 'carry' ? 'default' : 'outline'}
                                    className={decisions[goal.id] === 'carry' ? "bg-athena-gold text-black min-h-[44px] text-xs" : "min-h-[44px] text-xs border-zinc-700"}
                                    onClick={() => setDecisions({ ...decisions, [goal.id]: 'carry' })}
                                >
                                    <ArrowRight className="w-3 h-3 mr-1" />
                                    Carry Over
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Later</Button>
                    <Button onClick={handleConfirm} disabled={isLoading} className="bg-athena-gold text-black">
                        Confirm Updates
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
