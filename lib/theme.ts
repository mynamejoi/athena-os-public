/**
 * Shared theme/threshold utilities for score-based color coding.
 * Each metric uses a single-color scale from black → full intensity.
 *
 * Day    = accent color (athena-gold) — changes with theme
 * Recovery = athena-green (fixed)
 * Strain   = athena-strain (fixed warm brown)
 * Sleep    = athena-purple (fixed)
 */

export interface ThresholdStep {
    min: number;
    colorClass: string;
}

export function getScoreColor(value: number, thresholds: ThresholdStep[], fallback: string): string {
    for (const step of thresholds) {
        if (value >= step.min) return step.colorClass;
    }
    return fallback;
}

// ─── Day Score — black → shades of accent color (athena-gold) ───
const DAY_SCORE_THRESHOLDS: ThresholdStep[] = [
    { min: 85, colorClass: 'bg-athena-gold' },
    { min: 70, colorClass: 'bg-athena-gold/75' },
    { min: 50, colorClass: 'bg-athena-gold/55' },
    { min: 30, colorClass: 'bg-athena-gold/35' },
    { min: 1,  colorClass: 'bg-athena-gold/20' },
];

export function getDayScoreColor(score: number): string {
    return getScoreColor(score, DAY_SCORE_THRESHOLDS, 'bg-white/[0.06]');
}

// ─── Recovery — black → shades of green (fixed) ─────────────────
const RECOVERY_THRESHOLDS: ThresholdStep[] = [
    { min: 80, colorClass: 'bg-athena-green' },
    { min: 67, colorClass: 'bg-athena-green/75' },
    { min: 50, colorClass: 'bg-athena-green/55' },
    { min: 34, colorClass: 'bg-athena-green/35' },
    { min: 1,  colorClass: 'bg-athena-green/20' },
];

export function getRecoveryColor(score: number): string {
    return getScoreColor(score, RECOVERY_THRESHOLDS, 'bg-white/[0.06]');
}

// ─── Strain — black → shades of warm brown (fixed, skewed 4-15) ─
const STRAIN_THRESHOLDS: ThresholdStep[] = [
    { min: 15, colorClass: 'bg-athena-strain' },
    { min: 12, colorClass: 'bg-athena-strain/75' },
    { min: 9,  colorClass: 'bg-athena-strain/55' },
    { min: 6,  colorClass: 'bg-athena-strain/35' },
    { min: 1,  colorClass: 'bg-athena-strain/20' },
];

export function getStrainColor(score: number): string {
    return getScoreColor(score, STRAIN_THRESHOLDS, 'bg-white/[0.06]');
}

// ─── Sleep — black → shades of purple (fixed) ───────────────────
const SLEEP_SCORE_THRESHOLDS: ThresholdStep[] = [
    { min: 90, colorClass: 'bg-athena-purple' },
    { min: 80, colorClass: 'bg-athena-purple/75' },
    { min: 70, colorClass: 'bg-athena-purple/55' },
    { min: 60, colorClass: 'bg-athena-purple/35' },
    { min: 1,  colorClass: 'bg-athena-purple/20' },
];

export function getSleepScoreColor(score: number): string {
    return getScoreColor(score, SLEEP_SCORE_THRESHOLDS, 'bg-athena-purple/10');
}
