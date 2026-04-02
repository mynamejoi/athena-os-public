"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { cn } from "@/lib/utils";

type HabitConfig = {
    id: string;
    title: string;
    category: 'good' | 'bad';
    frequency: number[] | null; // 0-6 (Sun-Sat)
    icon: string;
    user_id?: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    currentDateStr: string; // To sync changes to today
    dayIndex: number;      // To check if today is affected
    onUpdateToday: () => void; // Refresh parent daily tasks
};

export function ManageHabitsModal({ isOpen, onClose, currentDateStr, dayIndex, onUpdateToday }: Props) {
    const supabase = createClient();
    const [habits, setHabits] = useState<HabitConfig[]>([]);
    const [loading, setLoading] = useState(false);

    // New Habit State
    const [isAdding, setIsAdding] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newFrequency, setNewFrequency] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // Default everyday

    useEffect(() => {
        if (isOpen) {
            fetchHabits();
        }
    }, [isOpen]);

    const fetchHabits = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('today_habits').select('*').order('created_at', { ascending: true });
        if (data) setHabits(data.map(h => ({
            ...h,
            frequency: typeof h.frequency === 'string' ? JSON.parse(h.frequency) : h.frequency // Handle JSON string if legacy
        })));
        setLoading(false);
    };

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const toggleDay = (day: number) => {
        if (newFrequency.includes(day)) {
            setNewFrequency(prev => prev.filter(d => d !== day));
        } else {
            setNewFrequency(prev => [...prev, day].sort());
        }
    };

    const toggleEditDay = async (habit: HabitConfig, day: number) => {
        const oldFreq = habit.frequency || [];
        let newFreq: number[];

        if (oldFreq.includes(day)) {
            newFreq = oldFreq.filter(d => d !== day);
        } else {
            newFreq = [...oldFreq, day].sort();
        }

        // Optimistic Update
        setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, frequency: newFreq } : h));

        // DB Update
        const { error } = await supabase.from('today_habits').update({ frequency: newFreq }).eq('id', habit.id);

        if (error) {
            toast.error("Failed to update schedule");
            fetchHabits(); // Revert
            return;
        }

        // Sync to Today?
        // If we just toggled TODAY (dayIndex), we need to add/remove from daily_tasks
        if (day === dayIndex) {
            if (newFreq.includes(dayIndex)) {
                // Added to today -> Insert into daily_tasks if not exists
                // We check existing in parent? Or just try insert (conflict?)
                // Actually daily_tasks doesn't have unique constraint on habit_id+date (one-offs allowed).
                // But generally we don't want dupes from same source_habit.
                // Let's check parent logic or do a quick check here.
                // For simplicity, we just trigger parent refresh, but parent won't "auto-add" if it thinks it's already done generation.
                // We must manually insert here.

                const { data: existing } = await supabase.from('daily_tasks')
                    .select('id')
                    .eq('date', currentDateStr)
                    .eq('source_habit_id', habit.id)
                    .maybeSingle();

                if (!existing) {
                    await supabase.from('daily_tasks').insert({
                        date: currentDateStr,
                        title: habit.title,
                        status: 'Pending',
                        source_habit_id: habit.id,
                        order: 99, // Append
                        is_priority: false,
                        is_one_off: false
                    });
                    onUpdateToday();
                }

            } else {
                // Removed from today -> Delete from daily_tasks if Pending
                // Only delete if it came from this habit
                await supabase.from('daily_tasks')
                    .delete()
                    .eq('date', currentDateStr)
                    .eq('source_habit_id', habit.id)
                    .eq('status', 'Pending'); // Don't delete completed tasks so history isn't lost? 
                // User said "allow me to select days... changes should only reflect on current day".
                // Creating/Deleting a task for today. If I completed it, do I want it gone?
                // Probably safest to only delete Pending. If I already did it, keep it.

                onUpdateToday();
            }
        }
    };

    const addHabit = async () => {
        if (!newTitle.trim()) return;

        const user = (await supabase.auth.getUser()).data.user;

        const newHabit = {
            title: newTitle,
            category: 'good',
            frequency: newFrequency, // Store as JSON array? Supabase handles array columns usually. 
            // In migration it was array if postgres array, or jsonb.
            // Let's check migration... actually I don't see it right now.
            // But previous code used `frequency: [dayIndex]`.
            icon: 'check',
            user_id: user?.id
        };

        const { data, error } = await supabase.from('today_habits').insert(newHabit).select().single();

        if (error) {
            toast.error("Failed to create habit");
            return;
        }

        setHabits([...habits, data]);
        setNewTitle("");
        setNewFrequency([0, 1, 2, 3, 4, 5, 6]);
        setIsAdding(false);
        toast.success("Habit created");

        // Sync to Today
        if (newFrequency.includes(dayIndex)) {
            await supabase.from('daily_tasks').insert({
                date: currentDateStr,
                title: data.title,
                status: 'Pending',
                source_habit_id: data.id,
                order: 99,
                is_priority: false,
                is_one_off: false
            });
            onUpdateToday();
        }
    };

    const deleteHabit = async (id: string, title: string) => {
        if (!confirm(`Permanently delete "${title}"? This will stop future recurring tasks.`)) return;

        // Optimistic
        setHabits(prev => prev.filter(h => h.id !== id));

        const { error } = await supabase.from('today_habits').delete().eq('id', id);

        if (error) {
            toast.error("Failed to delete");
            fetchHabits();
            return;
        }

        // Sync to Today: Remove pending instances
        await supabase.from('daily_tasks')
            .delete()
            .eq('date', currentDateStr)
            .eq('source_habit_id', id)
            .eq('status', 'Pending');

        onUpdateToday();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-athena-panel border-athena-border text-athena-text-primary max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl text-athena-gold">Manage Habits</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Add New Section */}
                    <div className="bg-athena-bg/50 p-4 rounded-lg border border-athena-border/50">
                        {!isAdding ? (
                            <Button
                                onClick={() => setIsAdding(true)}
                                className="w-full bg-athena-gold/10 hover:bg-athena-gold/20 text-athena-gold border border-athena-gold/30"
                            >
                                <Plus className="mr-2 h-4 w-4" /> Create New Habit
                            </Button>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    <Input
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="Habit Name (e.g., Morning Run)"
                                        className="bg-athena-bg border-athena-border text-athena-text-primary"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {days.map((day, i) => (
                                        <button
                                            key={day}
                                            onClick={() => toggleDay(i)}
                                            className={cn(
                                                "w-10 h-10 rounded-full text-[10px] font-bold transition-all border",
                                                newFrequency.includes(i)
                                                    ? "bg-athena-gold text-athena-bg border-athena-gold"
                                                    : "bg-transparent text-athena-text-muted border-athena-border hover:border-athena-gold/50"
                                            )}
                                        >
                                            {day[0]}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" onClick={() => setIsAdding(false)} className="text-athena-text-muted hover:text-athena-text-primary">Cancel</Button>
                                    <Button onClick={addHabit} className="bg-athena-gold text-athena-bg font-bold hover:bg-athena-gold-bright">Save Habit</Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* List Section */}
                    <div className="space-y-2">
                        <h3 className="text-xs uppercase tracking-widest text-athena-text-muted font-bold mb-4">Your Habits</h3>

                        {loading && <div className="text-center py-4 text-athena-text-muted">Loading...</div>}

                        {!loading && habits.length === 0 && (
                            <div className="text-center py-8 text-athena-text-dim italic">
                                No recurring habits set up yet.
                            </div>
                        )}

                        {habits.map((habit) => (
                            <div key={habit.id} className="group flex items-center justify-between p-3 rounded-lg border border-athena-border/30 bg-athena-bg/20 hover:border-athena-gold/30 transition-all">
                                <div>
                                    <div className="font-medium text-sm">{habit.title}</div>
                                    <div className="flex gap-1 mt-2">
                                        {days.map((day, i) => {
                                            const isActive = !habit.frequency || habit.frequency.includes(i);
                                            return (
                                                <button
                                                    key={day}
                                                    onClick={() => toggleEditDay(habit, i)}
                                                    className={cn(
                                                        "w-8 h-8 rounded flex items-center justify-center text-[9px] font-bold transition-all",
                                                        isActive
                                                            ? "bg-athena-gold/20 text-athena-gold"
                                                            : "bg-athena-border/10 text-athena-text-dim hover:bg-athena-border/30"
                                                    )}
                                                >
                                                    {day[0]}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteHabit(habit.id, habit.title)}
                                    className="opacity-0 group-hover:opacity-100 text-athena-red/70 hover:text-athena-red hover:bg-athena-red/10 transition-all"
                                >
                                    <Trash2 size={14} />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
