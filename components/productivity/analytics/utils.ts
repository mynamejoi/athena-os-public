
import { format, getDate, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, startOfYear, endOfYear, getDayOfYear } from 'date-fns';
import { DashboardDayData } from './types';

export function transformDataForDashboard(
    currentDate: Date,
    whoopData: any[],
    workouts: any[],
    dailyTasks: any[],
    viewType: 'month' | 'year' = 'month'
): DashboardDayData[] {
    const today = new Date();
    let start: Date;
    let end: Date;

    if (viewType === 'year') {
        start = startOfYear(currentDate);
        const isCurrentYear = start.getFullYear() === today.getFullYear();
        end = isCurrentYear ? today : endOfYear(currentDate);
    } else {
        start = startOfMonth(currentDate);
        const isCurrentMonth = start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear();
        end = isCurrentMonth ? today : endOfMonth(currentDate);
    }

    const allDays = eachDayOfInterval({ start, end });

    return allDays.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayNum = getDate(day);
        const dayOfWeek = format(day, 'EEE');

        // Find matching data
        const whoop = whoopData.find(w => w.date === dayStr);
        const dayWorkouts = workouts.filter(w => w.date === dayStr);
        const dayTasks = dailyTasks.filter(t => t.date === dayStr);

        // --- Metrics ---

        // Recovery
        const recovery = whoop?.whoop_recovery ?? null;
        const hrv = whoop?.whoop_hrv ? Math.round(whoop.whoop_hrv) : null;
        const rhr = whoop?.whoop_resting_hr ? Math.round(whoop.whoop_resting_hr) : null;

        // Strain
        const strain = whoop?.whoop_strain ?? null;
        const calories = whoop?.whoop_calories ? Math.round(whoop.whoop_calories) : null;

        // Sleep
        const sleepScore = whoop?.whoop_sleep_performance ?? null;
        const sleep_hours = whoop?.whoop_sleep_hours ?? null;
        const sleepEfficiency = whoop?.whoop_sleep_efficiency ? Math.round(whoop.whoop_sleep_efficiency) : null;
        const disturbances = whoop?.whoop_disturbances ?? null;
        const respRate = whoop?.whoop_respiratory_rate ?? null;
        const spo2 = whoop?.whoop_spo2 ?? null;

        // Official Sleep Debt (Whoop 4.0)
        // Check for official reported debt first
        const officialDebtMins = whoop?.whoop_reported_sleep_debt_minutes ?? null;
        const officialDebtHours = officialDebtMins != null ? officialDebtMins / 60 : null;

        // Corrected Debt (if backfilled/calculated)
        const correctedDebtMins = whoop?.sleep_debt_corrected_minutes ?? whoop?.sleep_debt_corrected ?? null;
        const correctedDebtHours = correctedDebtMins != null ? correctedDebtMins / 60 : null;


        // Sleep Stages
        // DB likely has milliseconds or minutes. 
        // whoop_sleep_stage_deep_mins etc.
        const deepMins = whoop?.whoop_sleep_stage_deep_mins ?? 0;
        const remMins = whoop?.whoop_sleep_stage_rem_mins ?? 0;
        const lightMins = whoop?.whoop_sleep_stage_light_mins ?? 0;
        const awakeMins = whoop?.whoop_sleep_stage_awake_mins ?? 0;
        const totalSleepMins = deepMins + remMins + lightMins + awakeMins || 1; // avoid /0

        const deepPct = (deepMins || remMins || lightMins || awakeMins) ? Math.round((deepMins / totalSleepMins) * 100) : null;
        const remPct = (deepMins || remMins || lightMins || awakeMins) ? Math.round((remMins / totalSleepMins) * 100) : null;
        const lightPct = (deepMins || remMins || lightMins || awakeMins) ? Math.round((lightMins / totalSleepMins) * 100) : null;
        const awakePct = (deepMins || remMins || lightMins || awakeMins) ? Math.round((awakeMins / totalSleepMins) * 100) : null;

        // Timings (Bed/Wake)
        // whoop_sleep_start, whoop_sleep_end assumed to be ISO strings or similar
        // Need to Convert to decimal hours.
        // E.g. 23:30 -> 23.5. 00:30 -> 24.5 or 0.5.
        // For visualization chart, we usually want 22, 23, 24, 25 (1am), 26 (2am)... OR 0, 1, 2.
        // The chart uses domain [21, 33] (9pm to 9am). So 1am should be 25.
        const bedTimeStr = whoop?.whoop_sleep_start;
        const wakeTimeStr = whoop?.whoop_sleep_end;

        let bedtime = null;
        let wakeTime = null;

        if (bedTimeStr) {
            const d = new Date(bedTimeStr);
            const h = d.getHours();
            const m = d.getMinutes();
            // If before noon (e.g. 01:00, 02:00), treat as next day (25, 26) relative to previous night 21:00
            // If hour is 0-11, add 24.
            // If hour is 12-23 (e.g. 23:00), keep as is.
            // Domain is typically [21, 33] (9pm - 9am)
            bedtime = h + m / 60;
            if (bedtime < 16) bedtime += 24; // Relaxed threshold to 4pm to catch early sleepers/naps? No, sticking to < 12 is safer for "night sleep". 
            // Actually, if someone sleeps at 1am, h=1. 1 < 12 => 25. Correct.
            // If someone sleeps at 8pm, h=20. 20 > 12. 20. Correct.
            // If someone sleeps at 1pm (nap), h=13. 13.
            if (bedtime < 12) bedtime += 24;
        }

        if (wakeTimeStr) {
            const d = new Date(wakeTimeStr);
            const h = d.getHours();
            const m = d.getMinutes();
            wakeTime = h + m / 60;
            // Wake time usually 5am - 11am.
            // 5am => 5. 5 < 12 => 29. Correct.
            // 11am => 11. 11 < 12 => 35. Correct.
            // 1pm => 13. 13. Incorrect? 13 is "1pm". 
            // If we use domain [21, 33] (9pm - 9am), then 1pm (13) is way off.
            // But 29 (5am) is inside [21, 33]? No. 21..24..30..33.
            // 5am should be 29.
            // 9am should be 33.
            if (wakeTime < 15) wakeTime += 24; // Extended to 3pm to catch late risers
        }

        // Workout Type
        // Find workout task: "Push (Chest)", "Pull (Back)", "Legs", or legacy "Gym (...)"
        const workoutTask = dayTasks.find(t => {
            const tl = t.title.toLowerCase();
            return tl.includes('gym') || tl.startsWith('push') || tl.startsWith('pull') || tl === 'legs' || tl === 'workout';
        });
        let workoutType = null;
        let workoutDuration = 0;

        if (workoutTask) {
            const lower = workoutTask.title.toLowerCase();
            if (lower.includes('push')) workoutType = 'Push';
            else if (lower.includes('pull')) workoutType = 'Pull';
            else if (lower.includes('legs') || lower.includes('leg')) workoutType = 'Legs';
            else workoutType = 'Gym';

            // Duration? Tasks don't track duration usually.
            // Maybe check if there is a matching Whoop workout on this day.
            const matchingWhoop = dayWorkouts.find(w => w.sport_name === 'Functional Fitness' || w.sport_name === 'Weightlifting');
            if (matchingWhoop) {
                workoutDuration = (parseFloat(matchingWhoop.duration_hours || '0'));
            } else {
                workoutDuration = 1; // Default estimate
            }
        } else if (dayWorkouts.length > 0) {
            // Find primary workout (highest strain or duration)
            const primary = dayWorkouts.sort((a, b) => b.strain - a.strain)[0];
            workoutType = primary.sport_name;
            workoutDuration = parseFloat(primary.duration_hours || '0');
        }

        return {
            day: dayNum,
            dayOfWeek,
            date: day,
            recovery,
            strain,
            sleepScore,
            hrv,
            rhr,
            deepPct,
            remPct,
            lightPct,
            awakePct,
            deepMins,
            remMins,
            lightMins,
            awakeMins,
            sleep_hours,
            bedtime,
            wakeTime,
            sleepEfficiency,
            disturbances,
            calories,
            workoutType,
            workoutDuration,
            respRate,
            spo2,
            whoop_official_sleep_debt_hours: officialDebtHours,
            whoop_sleep_debt_corrected_hours: correctedDebtHours,
            // Legacy fallbacks
            whoop_sleep_debt_hours: whoop?.whoop_sleep_debt != null ? whoop.whoop_sleep_debt / 60 : 0
        };
    });
}
