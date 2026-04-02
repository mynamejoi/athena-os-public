'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { HABIT_PRESETS, CATEGORY_LABELS, type HabitPreset } from '@/lib/onboarding-presets';
import { SINGLE_USER_ID } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { format, startOfMonth } from 'date-fns';

interface SetupModalProps {
  onComplete: () => void;
  trackCreatedId: (type: 'habits' | 'tasks' | 'projects' | 'books' | 'goals', id: string) => void;
}

interface SelectedHabit extends HabitPreset {
  key: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const CATEGORY_OPTIONS = ['Health', 'Growth', 'Work'] as const;
const UNIT_OPTIONS = ['times', 'books', 'hours', 'pages', 'days'] as const;
const DEFAULT_WORKOUT_TYPES = ['Push (Chest)', 'Push (Tricep)', 'Pull (Back)', 'Pull (Bicep)', 'Legs'];
const TOTAL_STEPS = 8;

const STEP_ROUTES: (string | null)[] = [
  '/productivity?tab=today-v2&view=health-v2',  // 0: Habits
  '/productivity?tab=analytics&view=month-v2',   // 1: Monthly Goal
  '/productivity?tab=year-v2',                   // 2: Yearly Goal
  '/productivity?tab=memories-v2',               // 3: Memories
  '/development-v2?tab=projects',                // 4: Project
  '/development-v2?tab=workouts',                // 5: Workouts
  '/development-v2?tab=library',                 // 6: Library
  null,                                          // 7: Done
];

const STEP_TITLES = [
  'Set Up Your Habits',
  'Set a Monthly Goal',
  'Set a Yearly Goal',
  'Capture a Memory',
  'Create Your First Project',
  'Workout Setup',
  'Add a Book',
  "You're All Set",
];

function getMonthSuggestion(titles: string[]): { title: string; target: string; unit: string; category: string } | null {
  const lower = titles.map((t) => t.toLowerCase());
  if (lower.some((t) => t.includes('gym') || t.includes('walk') || t.includes('cold plunge') || t.includes('sauna')))
    return { title: 'Exercise 12 times this month', target: '12', unit: 'times', category: 'Health' };
  if (lower.some((t) => t.includes('read')))
    return { title: 'Read 2 books this month', target: '2', unit: 'books', category: 'Growth' };
  if (lower.some((t) => t.includes('meditat')))
    return { title: 'Meditate 20 times this month', target: '20', unit: 'times', category: 'Health' };
  return null;
}

function getYearSuggestion(monthGoal: { title: string; target: string; unit: string; category: string } | null): { title: string; target: string; unit: string; category: string } | null {
  if (!monthGoal) return null;
  const monthTarget = parseInt(monthGoal.target) || 0;
  if (monthTarget <= 0) return null;
  const yearlyTarget = monthTarget * 12;
  const yearTitle = monthGoal.title.replace(/this month/i, 'this year').replace(/\d+/, String(yearlyTarget));
  return { title: yearTitle, target: String(yearlyTarget), unit: monthGoal.unit, category: monthGoal.category };
}

export function SetupModal({ onComplete, trackCreatedId }: SetupModalProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Habits
  const [selectedHabits, setSelectedHabits] = useState<Map<string, SelectedHabit>>(new Map());
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customFrequency, setCustomFrequency] = useState<number[]>(ALL_DAYS);
  const [createdHabitTitles, setCreatedHabitTitles] = useState<string[]>([]);
  const [hasGymHabit, setHasGymHabit] = useState(false);

  // Monthly Goal
  const [mGoalTitle, setMGoalTitle] = useState('');
  const [mGoalTarget, setMGoalTarget] = useState('');
  const [mGoalUnit, setMGoalUnit] = useState('times');
  const [mGoalCategory, setMGoalCategory] = useState('Health');
  const [createdMonthGoal, setCreatedMonthGoal] = useState<{ title: string; target: string; unit: string; category: string } | null>(null);

  // Yearly Goal
  const [yGoalTitle, setYGoalTitle] = useState('');
  const [yGoalTarget, setYGoalTarget] = useState('');
  const [yGoalUnit, setYGoalUnit] = useState('times');
  const [yGoalCategory, setYGoalCategory] = useState('Health');

  // Memory
  const [memoryTitle, setMemoryTitle] = useState('');
  const [memoryDate, setMemoryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Project
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  // Workout Types
  const [workoutTypes, setWorkoutTypes] = useState<string[]>([...DEFAULT_WORKOUT_TYPES]);
  const [newTypeName, setNewTypeName] = useState('');
  const [isAddingType, setIsAddingType] = useState(false);

  // Book
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookTotalPages, setBookTotalPages] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState('');

  // Summary
  const [summary, setSummary] = useState<string[]>([]);

  // Navigate on step change
  useEffect(() => {
    const route = STEP_ROUTES[step];
    if (!route) { setNavigating(false); return; }
    setNavigating(true);
    router.push(route);
    const timer = setTimeout(() => setNavigating(false), 300);
    return () => clearTimeout(timer);
  }, [step, router]);

  const togglePreset = (category: string, preset: HabitPreset) => {
    const key = `${category}:${preset.title}`;
    setSelectedHabits((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key); else next.set(key, { ...preset, key });
      return next;
    });
  };

  const addCustomHabit = () => {
    if (!customTitle.trim()) return;
    const key = `custom:${customTitle}`;
    setSelectedHabits((prev) => {
      const next = new Map(prev);
      next.set(key, { title: customTitle.trim(), frequency: customFrequency.length === 7 ? null : customFrequency, icon: 'check', key });
      return next;
    });
    setCustomTitle('');
    setCustomFrequency(ALL_DAYS);
    setIsAddingCustom(false);
  };

  const toggleDay = (day: number) => {
    setCustomFrequency((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const addSummary = (item: string) => setSummary((prev) => [...prev, item]);
  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));
  const finish = () => { onComplete(); router.push('/productivity?tab=today-v2&view=health-v2'); };

  const monthSuggestion = getMonthSuggestion(createdHabitTitles);
  const yearSuggestion = getYearSuggestion(createdMonthGoal);

  // ── Save handlers ──

  const saveHabits = async () => {
    if (selectedHabits.size === 0) { nextStep(); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const today = new Date();
    const dayIndex = today.getDay();
    const dateStr = format(today, 'yyyy-MM-dd');

    const habitsToInsert = Array.from(selectedHabits.values()).map((h) => ({
      title: h.title, category: 'good', frequency: null, icon: h.icon, user_id: user?.id,
    }));
    const { data: created, error: habitsError } = await supabase.from('today_habits').insert(habitsToInsert).select();
    if (habitsError) console.error('[Setup] Failed to create habits:', habitsError.message);
    if (created) {
      const titles: string[] = [];
      for (const h of created) { trackCreatedId('habits', h.id); titles.push(h.title); }
      setCreatedHabitTitles(titles);
      setHasGymHabit(titles.some((t) => /gym/i.test(t)));
      addSummary(`${created.length} habit${created.length !== 1 ? 's' : ''} created`);

      const tasksToInsert = created
        .filter((h) => { const f = typeof h.frequency === 'string' ? JSON.parse(h.frequency) : h.frequency; return !f || (f as number[]).includes(dayIndex); })
        .map((h, i) => ({ date: dateStr, title: h.title, status: 'Pending', source_habit_id: h.id, order: i, is_priority: false, is_one_off: false }));
      if (tasksToInsert.length > 0) {
        const { data: tasks, error: tasksError } = await supabase.from('daily_tasks').insert(tasksToInsert).select();
        if (tasksError) console.error('[Setup] Failed to create daily tasks:', tasksError.message);
        if (tasks) for (const t of tasks) trackCreatedId('tasks', t.id);
      }
    }
    setSaving(false);
    nextStep();
  };

  const saveMonthlyGoal = async () => {
    if (!mGoalTitle.trim() || !mGoalTarget) { nextStep(); return; }
    setSaving(true);
    const monthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthStr, category: mGoalCategory, title: mGoalTitle.trim(), target_value: parseInt(mGoalTarget), current_value: 0, unit: mGoalUnit, linked_metric: 'none' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.goal?.id) trackCreatedId('goals', data.goal.id);
    } else {
      console.error('[Setup] Failed to create monthly goal:', res.status);
    }
    setCreatedMonthGoal({ title: mGoalTitle.trim(), target: mGoalTarget, unit: mGoalUnit, category: mGoalCategory });
    addSummary(`Monthly goal "${mGoalTitle.trim()}" set`);
    setSaving(false);
    nextStep();
  };

  const saveYearlyGoal = async () => {
    if (!yGoalTitle.trim() || !yGoalTarget) { nextStep(); return; }
    setSaving(true);
    const year = new Date().getFullYear();
    const res = await fetch('/api/goals/year', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, category: yGoalCategory, title: yGoalTitle.trim(), target_value: parseInt(yGoalTarget), unit: yGoalUnit, linked_metric: 'none' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.goal?.id) trackCreatedId('goals', data.goal.id);
    } else {
      console.error('[Setup] Failed to create yearly goal:', res.status);
    }
    addSummary(`Yearly goal "${yGoalTitle.trim()}" set`);
    setSaving(false);
    nextStep();
  };

  const saveMemory = async () => {
    if (!memoryTitle.trim()) { nextStep(); return; }
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'anon';
    let imageUrl: string | null = null;
    if (memoryFile) {
      const fileExt = memoryFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('memories').upload(fileName, memoryFile);
      if (uploadError) console.error('[Setup] Failed to upload image:', uploadError.message);
      else {
        const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);
        imageUrl = publicUrl;
      }
    }
    const { error } = await supabase.from('memories').insert({
      user_id: user?.id || null, title: memoryTitle.trim(), image_url: imageUrl, orientation: 'landscape',
      description: '', event_date: memoryDate, gallery: imageUrl ? [{ url: imageUrl, orientation: 'landscape' }] : [],
      type: 'highlight', tags: [], end_date: null,
    });
    if (error) console.error('[Setup] Failed to save memory:', error.message);
    else addSummary(`Memory "${memoryTitle.trim()}" saved`);
    setSaving(false);
    nextStep();
  };

  const saveProject = async () => {
    if (!projectName.trim()) { nextStep(); return; }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('projects').insert({ user_id: SINGLE_USER_ID, name: projectName.trim(), description: projectDesc.trim() || null, status: 'Active' }).select().single();
    if (error) console.error('[Setup] Failed to create project:', error.message);
    if (data) { trackCreatedId('projects', data.id); addSummary(`Project "${projectName.trim()}" created`); }
    setSaving(false);
    nextStep();
  };

  const saveWorkoutTypes = () => {
    if (workoutTypes.length > 0) {
      localStorage.setItem('athena_workout_types', JSON.stringify(workoutTypes));
      addSummary(`${workoutTypes.length} workout type${workoutTypes.length !== 1 ? 's' : ''} configured`);
    }
    nextStep();
  };

  const saveBook = async () => {
    if (!bookTitle.trim()) { nextStep(); return; }
    setSaving(true);
    const supabase = createClient();
    const total = parseInt(bookTotalPages) || 0;
    const current = parseInt(bookCurrentPage) || 0;
    const status = total > 0 && current >= total ? 'Done' : current > 0 ? 'In Progress' : 'Not started';
    const { data, error } = await supabase.from('books').insert({ user_id: SINGLE_USER_ID, name: bookTitle.trim(), author: bookAuthor.trim() || null, total_pages: total, current_page: current, status, is_active: true, color: null, year_finished: null }).select().single();
    if (error) console.error('[Setup] Failed to save book:', error.message);
    if (data) { trackCreatedId('books', data.id); addSummary(`Book "${bookTitle.trim()}" added`); }
    setSaving(false);
    nextStep();
  };

  // ── Render helpers ──

  const goalForm = (
    title: string, setTitle: (v: string) => void,
    target: string, setTarget: (v: string) => void,
    unit: string, setUnit: (v: string) => void,
    category: string, setCategory: (v: string) => void,
    suggestion: { title: string; target: string; unit: string; category: string } | null,
  ) => (
    <div className="space-y-2 mb-4">
      {suggestion && !title && (
        <button onClick={() => { setTitle(suggestion.title); setTarget(suggestion.target); setUnit(suggestion.unit); setCategory(suggestion.category); }}
          className="mb-1 text-xs text-athena-gold/70 hover:text-athena-gold transition-colors italic">
          Suggested: {suggestion.title}
        </button>
      )}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title"
        className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
      <div className="flex gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" type="number"
          className="w-24 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)}
          className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/50">
          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        {CATEGORY_OPTIONS.map((c) => (
          <button key={c} onClick={() => setCategory(c)}
            className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all min-h-[44px]',
              category === c ? 'bg-athena-gold/15 border-athena-gold/50 text-athena-gold' : 'border-athena-border/50 text-athena-text-muted hover:border-athena-gold/30'
            )}>{c}</button>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    if (navigating) {
      return <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-athena-text-muted/20 border-t-athena-gold/60 rounded-full animate-spin" /></div>;
    }

    switch (step) {
      case 0: // Habits
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">These refresh daily based on your schedule. Select presets or add your own.</p>
            <div className="space-y-4 mb-4">
              {Object.entries(HABIT_PRESETS).map(([cat, presets]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-widest text-athena-text-dim/60 mb-2">{CATEGORY_LABELS[cat]}</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => {
                      const key = `${cat}:${preset.title}`;
                      return (
                        <button key={key} onClick={() => togglePreset(cat, preset)}
                          className={cn('px-3 py-2 rounded-lg text-sm font-medium border transition-all min-h-[44px]',
                            selectedHabits.has(key) ? 'bg-athena-gold/15 border-athena-gold/50 text-athena-gold' : 'bg-transparent border-athena-border/50 text-athena-text-muted hover:border-athena-gold/30'
                          )}>{preset.title}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!isAddingCustom ? (
                <button onClick={() => setIsAddingCustom(true)} className="flex items-center gap-2 text-sm text-athena-text-dim hover:text-athena-gold transition-colors">
                  <Plus className="w-4 h-4" /> Add Custom
                </button>
              ) : (
                <div className="bg-athena-bg/50 rounded-lg border border-athena-border/50 p-3 space-y-3">
                  <div className="flex gap-2">
                    <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Habit name"
                      className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50"
                      autoFocus onKeyDown={(e) => e.key === 'Enter' && addCustomHabit()} />
                    <button onClick={() => setIsAddingCustom(false)} className="p-2 text-athena-text-dim hover:text-athena-text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day, i) => (
                      <button key={day} onClick={() => toggleDay(i)}
                        className={cn('w-10 h-10 rounded-full text-[10px] font-bold transition-all border',
                          customFrequency.includes(i) ? 'bg-athena-gold text-athena-bg border-athena-gold' : 'bg-transparent text-athena-text-muted border-athena-border hover:border-athena-gold/50'
                        )}>{day[0]}</button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button onClick={addCustomHabit} disabled={!customTitle.trim()}
                      className="px-4 py-2 rounded-lg bg-athena-gold text-athena-bg text-sm font-bold disabled:opacity-40 hover:brightness-110 transition-all min-h-[44px]">Add</button>
                  </div>
                </div>
              )}
              {selectedHabits.size > 0 && <p className="text-xs text-athena-text-dim">{selectedHabits.size} habit{selectedHabits.size !== 1 ? 's' : ''} selected</p>}
            </div>
            <button onClick={saveHabits} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
              {saving ? 'Creating...' : selectedHabits.size > 0 ? 'Save & Continue' : 'Skip'}
            </button>
          </>
        );

      case 1: // Monthly Goal
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">Goals show as progress rings on the Month view. Link them to habits for automatic tracking.</p>
            {goalForm(mGoalTitle, setMGoalTitle, mGoalTarget, setMGoalTarget, mGoalUnit, setMGoalUnit, mGoalCategory, setMGoalCategory, monthSuggestion)}
            <div className="flex flex-col gap-2">
              <button onClick={saveMonthlyGoal} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
                {saving ? 'Creating...' : (mGoalTitle.trim() && mGoalTarget) ? 'Set Goal & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 2: // Yearly Goal
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">Yearly goals break down into monthly targets automatically. Set the big picture here.</p>
            {goalForm(yGoalTitle, setYGoalTitle, yGoalTarget, setYGoalTarget, yGoalUnit, setYGoalUnit, yGoalCategory, setYGoalCategory, yearSuggestion)}
            <div className="flex flex-col gap-2">
              <button onClick={saveYearlyGoal} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
                {saving ? 'Creating...' : (yGoalTitle.trim() && yGoalTarget) ? 'Set Goal & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 3: // Memories
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">Save highlights and vacations with photos. Tag them to build a personal timeline.</p>
            <div className="space-y-2 mb-4">
              <input value={memoryTitle} onChange={(e) => setMemoryTitle(e.target.value)} placeholder="Memory title"
                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
              <input type="date" value={memoryDate} onChange={(e) => setMemoryDate(e.target.value)}
                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary focus:outline-none focus:border-athena-gold/50" />
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setMemoryFile(e.target.files?.[0] || null)} />
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 rounded-lg border border-dashed border-athena-border/50 text-sm text-athena-text-dim hover:text-athena-gold hover:border-athena-gold/30 transition-colors min-h-[44px]">
                  {memoryFile ? memoryFile.name : 'Upload image (optional)'}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={saveMemory} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
                {saving ? 'Saving...' : memoryTitle.trim() ? 'Save & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 4: // Project
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">Organize your work with projects, sections, and tasks. The AI Planner can structure ideas for you.</p>
            <div className="space-y-2 mb-4">
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name"
                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
              <input value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} placeholder="Description (optional)"
                className="w-full bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={saveProject} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
                {saving ? 'Creating...' : projectName.trim() ? 'Create & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 5: // Workouts (info + type customization)
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-3">Athena builds weekly workout splits and gives AI coaching before each session. This works best with a gym habit.</p>
            {hasGymHabit && <p className="text-xs text-athena-gold/70 mb-3 italic">Your gym habit is set. Athena will generate your first weekly plan automatically.</p>}
            <p className="text-[10px] uppercase tracking-widest text-athena-text-dim/60 mb-2 font-bold">Workout Types</p>
            <div className="space-y-2 mb-4">
              {workoutTypes.map((type, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-athena-border/50 bg-white/[0.02]">
                  <span className="text-sm text-athena-text-primary">{type}</span>
                  <button onClick={() => setWorkoutTypes((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1.5 text-athena-text-dim hover:text-athena-red transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {!isAddingType ? (
                <button onClick={() => setIsAddingType(true)} className="flex items-center gap-2 text-sm text-athena-text-dim hover:text-athena-gold transition-colors">
                  <Plus className="w-4 h-4" /> Add Type
                </button>
              ) : (
                <div className="flex gap-2">
                  <input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Type name"
                    className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50"
                    autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && newTypeName.trim()) { setWorkoutTypes((prev) => [...prev, newTypeName.trim()]); setNewTypeName(''); setIsAddingType(false); } }} />
                  <button onClick={() => { if (newTypeName.trim()) { setWorkoutTypes((prev) => [...prev, newTypeName.trim()]); setNewTypeName(''); setIsAddingType(false); } }}
                    disabled={!newTypeName.trim()}
                    className="px-4 py-2 rounded-lg bg-athena-gold text-athena-bg text-sm font-bold disabled:opacity-40 hover:brightness-110 transition-all min-h-[44px]">Add</button>
                  <button onClick={() => { setIsAddingType(false); setNewTypeName(''); }}
                    className="p-2 text-athena-text-dim hover:text-athena-text-primary min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={saveWorkoutTypes} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]">
                {workoutTypes.length > 0 ? 'Save & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 6: // Library
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">Track what you&apos;re reading. Log pages on the Today page and Athena calculates your reading pace.</p>
            <div className="space-y-2 mb-4">
              <div className="flex gap-2">
                <input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} placeholder="Title"
                  className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
                <input value={bookAuthor} onChange={(e) => setBookAuthor(e.target.value)} placeholder="Author"
                  className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
              </div>
              <div className="flex gap-2">
                <input value={bookTotalPages} onChange={(e) => setBookTotalPages(e.target.value)} placeholder="Total pages" type="number"
                  className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
                <input value={bookCurrentPage} onChange={(e) => setBookCurrentPage(e.target.value)} placeholder="Current page" type="number"
                  className="flex-1 bg-athena-bg border border-athena-border rounded-lg px-3 py-2.5 text-base md:text-sm text-athena-text-primary placeholder:text-athena-text-dim focus:outline-none focus:border-athena-gold/50" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={saveBook} disabled={saving} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 min-h-[44px]">
                {saving ? 'Adding...' : bookTitle.trim() ? 'Add Book & Continue' : 'Skip'}
              </button>
              <button onClick={prevStep} className="w-full py-2 text-sm text-athena-text-dim/50 hover:text-athena-text-muted transition-colors min-h-[44px]">Back</button>
            </div>
          </>
        );

      case 7: // Done
        return (
          <>
            <p className="text-athena-text-muted text-sm leading-relaxed mb-4">
              {summary.length > 0 ? 'Here\'s what was set up:' : 'No data created yet. You can set everything up later from each page.'}
            </p>
            {summary.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {summary.map((item, i) => <p key={i} className="text-sm text-athena-text-muted">{item}</p>)}
              </div>
            )}
            <p className="text-xs text-athena-text-dim leading-relaxed mb-6">Athena will generate your first morning briefing tomorrow based on today&apos;s activity. Check back each morning for personalized insights.</p>
            <button onClick={finish} className="w-full py-3 rounded-xl bg-athena-gold text-athena-bg font-bold text-sm tracking-wide hover:brightness-110 active:scale-[0.98] transition-all min-h-[44px]">Start Using Athena</button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="bg-athena-bg border border-athena-border rounded-2xl p-6 max-w-lg w-[90vw] max-h-[85vh] overflow-y-auto relative"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-athena-text-dim uppercase tracking-widest">Step {step + 1} of {TOTAL_STEPS}</span>
            <button onClick={finish} className="p-2 -mr-2 -mt-2 text-athena-text-dim hover:text-athena-text-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
          <h2 className="text-2xl font-serif text-athena-gold mb-3">{STEP_TITLES[step]}</h2>
          {renderContent()}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === step ? 'bg-athena-gold w-3' : i < step ? 'bg-athena-gold/40' : 'bg-athena-text-dim/30'}`} />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
