
export interface DashboardDayData {
    day: number;
    dayOfWeek: string;
    recovery: number | null;
    strain: number | null;
    sleepScore: number | null;
    hrv: number | null;
    rhr: number | null;
    deepPct: number | null;
    remPct: number | null;
    lightPct: number | null;
    awakePct: number | null;
    deepMins: number | null;
    remMins: number | null;
    lightMins: number | null;
    awakeMins: number | null;
    sleep_hours: number | null;
    bedtime: number | null;
    wakeTime: number | null;
    sleepEfficiency: number | null;
    disturbances: number | null;
    calories: number | null;
    workoutType: string | null;
    workoutDuration: number | null;
    respRate: number | null;
    spo2: number | null;
    whoop_official_sleep_debt_hours?: number | null;
    whoop_sleep_debt_corrected_hours?: number | null;
    whoop_sleep_debt_hours?: number | null;
    date: Date; // Keep original date object for reference if needed
}
