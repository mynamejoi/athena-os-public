/**
 * Shared color constants used across productivity components.
 * Extracted to avoid duplication of color maps.
 */

/** Project color map — maps project color names to hex values */
export const PROJECT_COLORS: Record<string, string> = {
    blue: '#3b82f6',
    purple: '#a855f7',
    green: '#22c55e',
    slate: '#64748b',
    orange: '#f97316',
    red: '#ef4444',
    gold: '#FACC15',
    teal: '#14b8a6',
    default: '#71717a'
};

/** Workout type colors — sub-typed push/pull for comparison matching */
export const WORKOUT_TYPE_COLORS: Record<string, string> = {
    'Push (Chest)': '#f472b6', 'Push (Tricep)': '#e879a0',
    'Pull (Bicep)': '#60a5fa', 'Pull (Back)': '#3b82f6',
    // Legacy compat
    Push: '#f472b6', Pull: '#3b82f6',
    Legs: '#c084fc',
    Cardio: '#FACC15', Recovery: '#4ade80', Gym: '#9ca3af',
    Basketball: '#f97316', Golf: '#22c55e', Running: '#3b82f6',
    Swimming: '#06b6d4', Cycling: '#3b82f6', 'Rock Climbing': '#d97706',
    Hiking: '#84cc16', Walk: '#ec4899',
    Other: '#6b7280'
};
