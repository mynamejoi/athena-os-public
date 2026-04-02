export interface HabitPreset {
  title: string;
  frequency: number[] | null; // null = every day
  icon: string;
}

export const HABIT_PRESETS: Record<string, HabitPreset[]> = {
  health: [
    { title: 'Hydrate', frequency: null, icon: 'droplets' },
    { title: 'Walk', frequency: null, icon: 'footprints' },
    { title: 'Meditate', frequency: null, icon: 'brain' },
    { title: 'No Snoozing', frequency: null, icon: 'alarm-clock' },
    { title: '6+ Hour Sleep', frequency: null, icon: 'moon' },
  ],
  growth: [
    { title: 'Read Book', frequency: null, icon: 'book-open' },
    { title: 'Journal', frequency: null, icon: 'pencil' },
    { title: 'Creative Work', frequency: null, icon: 'palette' },
    { title: 'Chess Puzzles', frequency: null, icon: 'trophy' },
  ],
  recovery: [
    { title: 'Creatine', frequency: null, icon: 'pill' },
  ],
};

export const CATEGORY_LABELS: Record<string, string> = {
  health: 'Health',
  growth: 'Growth',
  recovery: 'Recovery',
};
