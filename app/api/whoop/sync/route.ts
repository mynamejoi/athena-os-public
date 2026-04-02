

import { fetchWhoopData, refreshWhoopToken } from '@/lib/whoop';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';
import { toETDateString } from '@/lib/date-utils';

// Shared label normalization map — covers all input formats
const SPLIT_MAP: Record<string, string> = {
    // With parens (canonical)
    'Push (Chest)': 'Push (Chest)',
    'Push (Tricep)': 'Push (Tricep)',
    'Pull (Back)': 'Pull (Back)',
    'Pull (Bicep)': 'Pull (Bicep)',
    // Without parens
    'Push Chest': 'Push (Chest)',
    'Push Tricep': 'Push (Tricep)',
    'Pull Back': 'Pull (Back)',
    'Pull Bicep': 'Pull (Bicep)',
    // Lowercase
    'push chest': 'Push (Chest)',
    'push tricep': 'Push (Tricep)',
    'pull back': 'Pull (Back)',
    'pull bicep': 'Pull (Bicep)',
    // Legacy
    'Push Day': 'Push (Chest)',
    'Pull Day': 'Pull (Back)',
    'Leg Day': 'Legs',
    'leg day': 'Legs',
    // Short
    'Push': 'Push (Chest)',
    'Pull': 'Pull (Back)',
    'Legs': 'Legs',
    'legs': 'Legs',
    // Other
    'Cardio': 'Cardio',
    'Recovery': 'Recovery',
};

// Vercel cron sends GET requests
export async function GET() {
    return POST();
}

export async function POST() {
    // Verify Env Vars
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('[Whoop Sync] Missing Supabase Service Credentials');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Use Service Role to bypass all RLS/Auth checks
    const supabase = createClient(supabaseUrl, serviceKey);

    // Single User Mode: Use valid UUID from auth.users (created via script)
    const userId = SINGLE_USER_ID;

    try {
        // 1. Get Tokens
        const { data: tokenData, error: tokenError } = await supabase
            .from('whoop_tokens')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (tokenError) {
            console.error('[Whoop Sync] Token Fetch Error:', tokenError);
        }

        if (!tokenData) {
            console.error('[Whoop Sync] No Token Data Found for user:', userId);
            return NextResponse.json({ error: 'Not connected to Whoop' }, { status: 400 });
        }
        let accessToken = tokenData.access_token;
        const expiresAt = new Date(tokenData.expires_at).getTime();

        // 2. Refresh Token if expired (buffer 5 mins)
        if (Date.now() > expiresAt - (5 * 60 * 1000)) {
            const newTokens = await refreshWhoopToken(tokenData.refresh_token);
            accessToken = newTokens.access_token;

            await supabase.from('whoop_tokens').update({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token,
                expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString(),
                updated_at: new Date().toISOString()
            }).eq('user_id', userId);
        }

        // 3. Fetch Data
        const today = new Date().toISOString();
        // Default to 30 days ago
        let startDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();

        // Check DB for latest date to optimize sync
        const { data: latestData } = await supabase
            .from('whoop_data')
            .select('date')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestData?.date) {
            // Use latest date - 14 day buffer (increased from 7) to ensure we catch Sleep records starting previous nights
            // and heal any recent gaps or "unsynced" days (like Feb 8th issue).
            const lastDate = new Date(latestData.date);
            const bufferDate = new Date(lastDate.getTime() - (14 * 24 * 60 * 60 * 1000));
            startDate = bufferDate.toISOString();
        } else {
        }

        // Whoop API requires ISO strings
        const buildUrl = (path: string, limit: number = 25) => {
            // Max limit is 25. For full 30 days we'd need pagination, 
            // but for incremental (7 days) 25 is sufficient.
            const params = new URLSearchParams({
                start: startDate,
                end: today,
                limit: limit.toString()
            });
            return `${path}?${params.toString()}`;
        };

        // Helper to fetch all pages
        const fetchAllPages = async (path: string, limit: number = 25) => {
            let allRecords: any[] = [];
            let nextToken: string | undefined = undefined;
            const baseUrl = path.split('?')[0];
            const baseParams = new URLSearchParams(path.split('?')[1]);

            do {
                if (nextToken) {
                    baseParams.set('nextToken', nextToken);
                }
                const url = `${baseUrl}?${baseParams.toString()}`;

                const data = await fetchWhoopData(accessToken, url);

                if (data.records) {
                    allRecords = [...allRecords, ...data.records];
                }
                nextToken = data.next_token;

            } while (nextToken && allRecords.length < 500); // Safety cap at 500 records

            return { records: allRecords };
        };

        const cycleData = await fetchAllPages(buildUrl('/v2/cycle'));
        const recoveryData = await fetchAllPages(buildUrl('/v2/recovery'));
        const sleepData = await fetchAllPages(buildUrl('/v2/activity/sleep'));
        const workoutData = await fetchAllPages(buildUrl('/v2/activity/workout', 25));

        // 4. Process and Store Logic
        // We'll process cycles as the base "day"
        // Note: Whoop returns data in arrays. We need to match them up by date/IDs.

        let processedCount = 0;
        let freshRecoveryToday = false;
        const todayStrForRecovery = toETDateString(new Date());

        // Helper Map by date (YYYY-MM-DD)
        const recoveriesByDate = new Map();
        recoveryData.records?.forEach((r: any) => {
            // cycle_id connects recovery to cycle
            if (r.cycle_id) recoveriesByDate.set(r.cycle_id, r);
        });

        const sleepsByDate = new Map();
        sleepData.records?.forEach((s: any) => {
            // "sleep" is usually associated with a cycle ID too?
            // Whoop docs say sleep acts as the recovery for the next cycle usually.
            // Or we just index by `start` time date.
            // Actually sleep object has `nap` boolean.
            if (!s.nap && s.cycle_id) sleepsByDate.set(s.cycle_id, s);
        });

        for (const cycle of (cycleData.records || [])) {
            const recovery = recoveriesByDate.get(cycle.id); // Matches cycle_id (int)

            // Sleep linking needs care. 
            // V2 Sleep has `cycle_id` (int), matching `cycle.id`.
            const sleep = sleepsByDate.get(cycle.id);

            // DATE ATTRIBUTION FIX:
            // WHOOP's cycle model: A cycle starts when you wake up and ends when you wake up the next day.
            // The sleep that ENDS (wake time) defines the start of a new day.
            // We use sleep.end (wake time) if available, otherwise use cycle.start converted to local date.
            let date: string;
            if (sleep?.end) {
                // Use sleep END time (when you wake up) - this is when the "day" begins
                date = toETDateString(new Date(sleep.end));
            } else {
                // Fallback: Use cycle start time converted to local ET date
                date = toETDateString(new Date(cycle.start));
            }

            // SAFEGUARD: Prevent NULL overwrites
            // If we have no sleep/recovery data, check if existing record has data
            if (!sleep && !recovery) {
                const { data: existing } = await supabase
                    .from('whoop_data')
                    .select('sleep_hours, recovery_score')
                    .eq('user_id', userId)
                    .eq('date', date)
                    .maybeSingle();

                // Skip if existing record has sleep or recovery data
                if (existing && (existing.sleep_hours || existing.recovery_score)) {
                    continue;
                }
                // Otherwise allow the upsert (new record or updating empty record)
            }

            // Handle in-progress cycles (score_state: PENDING_SCORE) - they may not have .score
            const cycleScore = cycle.score || {};

            // 0. Fetch Existing Data for Merge (Prevent Null Overwrites)
            const { data: existingRecord } = await supabase
                .from('whoop_data')
                .select('*')
                .eq('user_id', userId)
                .eq('date', date)
                .maybeSingle();

            // Helper to merge new value with existing (prefer new if present, else keep existing)
            // If new is null/undefined, keep existing. If both null, result null.
            const merge = (newVal: any, existingVal: any) => {
                return (newVal !== null && newVal !== undefined) ? newVal : existingVal;
            };

            const payload = {
                user_id: userId,
                date: date,
                strain: merge(cycleScore.strain, existingRecord?.strain),
                recovery_score: merge(recovery ? recovery.score.recovery_score : null, existingRecord?.recovery_score),
                hrv: merge(recovery ? recovery.score.hrv_rmssd_milli : null, existingRecord?.hrv),
                resting_hr: merge(recovery ? recovery.score.resting_heart_rate : null, existingRecord?.resting_hr),

                // Sleep Scores (Legacy columns)
                sleep_performance: merge(sleep ? sleep.score.sleep_performance_percentage : null, existingRecord?.sleep_performance),
                sleep_consistency: merge(sleep ? sleep.score.sleep_consistency_percentage : null, existingRecord?.sleep_consistency),
                sleep_hours: merge(sleep ? ((sleep.score.stage_summary.total_in_bed_time_milli - sleep.score.stage_summary.total_awake_time_milli) / 3600000) : null, existingRecord?.sleep_hours),

                // NEW Detailed Metrics
                sleep_efficiency_percentage: merge(sleep ? Math.round(sleep.score.sleep_efficiency_percentage) : null, existingRecord?.sleep_efficiency_percentage),
                sleep_stage_light_minutes: merge(sleep ? Math.round(sleep.score.stage_summary.total_light_sleep_time_milli / 60000) : null, existingRecord?.sleep_stage_light_minutes),
                sleep_stage_deep_minutes: merge(sleep ? Math.round(sleep.score.stage_summary.total_slow_wave_sleep_time_milli / 60000) : null, existingRecord?.sleep_stage_deep_minutes),
                sleep_stage_rem_minutes: merge(sleep ? Math.round(sleep.score.stage_summary.total_rem_sleep_time_milli / 60000) : null, existingRecord?.sleep_stage_rem_minutes),
                sleep_stage_awake_minutes: merge(sleep ? Math.round(sleep.score.stage_summary.total_awake_time_milli / 60000) : null, existingRecord?.sleep_stage_awake_minutes),

                // Sleep Debt & Need
                sleep_debt_minutes: merge(sleep ? Math.max(0, Math.round((
                    sleep.score.sleep_needed.baseline_milli +
                    sleep.score.sleep_needed.need_from_sleep_debt_milli +
                    sleep.score.sleep_needed.need_from_recent_strain_milli -
                    sleep.score.sleep_needed.need_from_recent_nap_milli -
                    (sleep.score.stage_summary.total_in_bed_time_milli - sleep.score.stage_summary.total_awake_time_milli)
                ) / 60000)) : null, existingRecord?.sleep_debt_minutes),

                sleep_need_baseline_minutes: merge(sleep ? Math.round((
                    sleep.score.sleep_needed.baseline_milli +
                    sleep.score.sleep_needed.need_from_sleep_debt_milli +
                    sleep.score.sleep_needed.need_from_recent_strain_milli -
                    sleep.score.sleep_needed.need_from_recent_nap_milli
                ) / 60000) : null, existingRecord?.sleep_need_baseline_minutes),

                whoop_reported_sleep_debt_minutes: merge(sleep ? Math.round(sleep.score.sleep_needed.need_from_sleep_debt_milli / 60000) : null, existingRecord?.whoop_reported_sleep_debt_minutes,),

                respiratory_rate: merge(sleep ? sleep.score.respiratory_rate : null, existingRecord?.respiratory_rate),
                spo2_percentage: merge(recovery ? recovery.score.spo2_percentage : null, existingRecord?.spo2_percentage),
                skin_temp_celsius: merge(recovery ? recovery.score.skin_temp_celsius : null, existingRecord?.skin_temp_celsius),
                calories_burned: merge(cycleScore.kilojoule ? Math.round(cycleScore.kilojoule / 4.184) : null, existingRecord?.calories_burned),

                // Sleep Timing 
                sleep_start: merge(sleep ? sleep.start : null, existingRecord?.sleep_start),
                sleep_end: merge(sleep ? sleep.end : null, existingRecord?.sleep_end),

                raw_data: { cycle, recovery, sleep }, // Overwrite raw data with latest fetch
                updated_at: new Date().toISOString()
            };

            const { error: insertError } = await supabase.from('whoop_data').upsert(payload, { onConflict: 'user_id, date' });

            if (insertError) {
                console.error(`[Whoop Sync] Failed to insert ${date}:`, insertError);
            } else {
                processedCount++;
                // Track if fresh recovery arrived for today
                if (date === todayStrForRecovery && payload.recovery_score != null && !existingRecord?.recovery_score) {
                    freshRecoveryToday = true;
                }
            }
        }

        // 5. Process Workouts
        // Sport ID to name mapping (all known WHOOP activities)
        // Note: Whoop V2 API also returns sport_name as a string — the fallback below uses it
        const sportMapping: { [key: number]: string } = {
            [-1]: 'General Activity',
            0: 'Activity',
            1: 'Running',
            2: 'Cycling',
            3: 'Swimming',
            4: 'Walking',
            5: 'HIIT',
            6: 'Yoga',
            7: 'Pilates',
            8: 'Rowing',
            9: 'Stretching',
            10: 'Boxing',
            11: 'Kickboxing',
            12: 'Martial Arts',
            13: 'Tennis',
            14: 'Soccer',
            15: 'Football',
            16: 'Baseball',
            17: 'Basketball',
            18: 'Volleyball',
            19: 'Hockey',
            20: 'Lacrosse',
            21: 'Rugby',
            22: 'Golf',
            23: 'Hiking',
            24: 'Skiing',
            25: 'Snowboarding',
            26: 'Surfing',
            27: 'Skateboarding',
            28: 'Paddleboarding',
            29: 'Kayaking',
            30: 'Canoeing',
            31: 'Rowing',
            32: 'Sailing',
            33: 'Diving',
            34: 'Water Polo',
            35: 'Triathlon',
            36: 'Duathlon',
            37: 'Obstacle Course Racing',
            38: 'Track & Field',
            39: 'Cross Country Skiing',
            40: 'Squash',
            41: 'Racquetball',
            42: 'Badminton',
            43: 'Table Tennis',
            44: 'Functional Fitness',
            45: 'CrossFit',
            46: 'Dance',
            47: 'Elliptical',
            48: 'Functional Fitness',
            49: 'Stairmaster',
            50: 'Meditation',
            51: 'Jumping Rope',
            52: 'Gymnastics',
            53: 'Fencing',
            54: 'Handball',
            55: 'Wrestling',
            56: 'Jiu Jitsu',
            57: 'Judo',
            58: 'Muay Thai',
            59: 'Bouldering',
            60: 'Rock Climbing',
            61: 'Mountaineering',
            62: 'Mountain Biking',
            63: 'Cycling',
            64: 'Road Cycling',
            65: 'Trail Running',
            66: 'Sprint Training',
            67: 'Rucking',
            68: 'Horseback Riding',
            69: 'Cheerleading',
            70: 'Powerlifting',
            71: 'Weightlifting',
            72: 'Bodybuilding',
            73: 'Kettlebell Swing',
            74: 'Pickleball',
            75: 'Disc Golf',
            76: 'Cricket',
            77: 'Softball',
            78: 'Inline Skating',
            79: 'Ice Skating',
            80: 'Parkour',
            81: 'Snowshoeing',
            82: 'Roller Hockey',
            83: 'Motocross',
            84: 'Motor Racing',
            85: 'Polo',
            86: 'Water Skiing',
            87: 'Freediving',
            88: 'Ice Bath',
            89: 'Hot Yoga',
            90: 'Barre',
            91: 'Reformer Pilates',
            92: 'Sculpt Yoga',
            93: 'Ballet',
            94: 'Breakdancing',
            95: 'Circus Arts',
            96: 'F45 Training',
            97: 'Spin',
            98: 'Solidcore',
            99: 'Stroller Walking',
            100: 'Stroller Jogging',
            101: 'Wheelchair Pushing',
            102: 'Dog Walking',
            103: 'Cleaning',
            104: 'Cooking',
            105: 'Manual Labor',
            106: 'Yard Work',
            107: 'Fishing',
            108: 'Firefighting',
            109: 'Skydiving',
            110: 'Strength Trainer',
            111: 'Sauna',
            112: 'Musical Performance',
            113: 'Stage Performance',
            114: 'Public Speaking',
            115: 'High-Stress Work',
            116: 'Gaming',
            117: 'Watching Sports',
            118: 'Dedicated Parenting',
            119: 'Babywearing',
            120: 'Nursing',
            121: 'Pumping',
            122: 'Coaching',
            123: 'Refereeing',
            124: 'Commuting',
            125: 'Driving',
            126: 'Scootering',
            127: 'Gravel Riding',
            128: 'Kite Boarding',
            129: 'Paintball',
            130: 'Assault Bike',
            131: 'Battle Ropes',
            132: 'Nordic Walking',
            133: 'Spikeball',
            134: 'Paddle Tennis',
            135: 'Padel',
            136: 'Curling',
            137: 'Archery',
            138: 'Billiards',
            139: 'Poker',
            140: 'Darts',
            141: 'Chess',
            142: 'Netball',
            143: 'Touch Rugby',
            144: 'Gaelic Football',
            145: 'Hurling',
            146: 'Australian Rules Football',
            147: 'Ultimate',
            148: 'Caddying',
            149: 'Ski Touring',
            150: 'Climber',
            192: 'Shoveling',
            233: 'Sauna',
            247: 'Steam Room',
        };

        let workoutCount = 0;

        // Pre-fetch Habit Labels (Push/Pull/Leg) for Functional Fitness association
        const workoutDates = (workoutData.records || []).map((w: any) =>
            toETDateString(new Date(w.start))
        );
        const uniqueWorkoutDates = [...new Set(workoutDates)];
        const habitLabelMap: Record<string, string> = {};

        if (uniqueWorkoutDates.length > 0) {
            // Fetch completed gym-type daily tasks to associate labels with workouts
            const { data: gymTasks } = await supabase
                .from('daily_tasks')
                .select('date, title')
                .in('date', uniqueWorkoutDates)
                .eq('status', 'Completed')
                .not('source_habit_id', 'is', null);

            if (gymTasks) {
                gymTasks.forEach((t: any) => {
                    // Match workout tasks: "Push (Chest)", "Pull (Back)", "Legs", or legacy "Gym (Push Chest)"
                    const title = t.title || '';
                    const gymMatch = title.match(/^gym\s*\((.+)\)$/i);
                    const label = gymMatch ? gymMatch[1] : title; // Strip "Gym (...)" wrapper if present
                    if (/push|pull|leg/i.test(label) && t.date) {
                        habitLabelMap[t.date] = label;
                    }
                });
            }
        }


        // Recovery activities: skip whoop_workouts upsert but still process for companion task auto-completion
        const RECOVERY_SPORT_IDS = new Set([88, 111, 233, 247]); // Ice Bath (88), Sauna (111, 233), Steam Room (247)

        for (const workout of (workoutData.records || [])) {
            // Fix: Use user's timezone (EST) to determine the "day" of the workout
            // This prevents 8 PM EST workouts (which are 1 AM UTC next day) from showing up on the wrong day
            const date = toETDateString(new Date(workout.start));
            // Prefer WHOOP API's sport_name (authoritative) over our static mapping (can be outdated)
            const rawApiName = workout.sport_name;
            const sportName = (rawApiName && rawApiName !== 'activity')
                ? rawApiName.charAt(0).toUpperCase() + rawApiName.slice(1)
                : sportMapping[workout.sport_id] || rawApiName || `Sport ${workout.sport_id}`;

            // Skip recovery activities from whoop_workouts (they're handled by companion task logic below)
            if (RECOVERY_SPORT_IDS.has(workout.sport_id)) {
                continue;
            }

            // Check if this workout exists and has a locked label
            const { data: existingWorkout } = await supabase
                .from('whoop_workouts')
                .select('label_locked')
                .eq('user_id', userId)
                .eq('whoop_id', workout.id)
                .maybeSingle();

            const shouldUpdateLabel = !existingWorkout?.label_locked;

            const workoutPayload: any = {
                user_id: userId,
                whoop_id: workout.id,
                date: date,
                sport_id: workout.sport_id,
                sport_name: sportName,
                duration_minutes: workout.end ? (new Date(workout.end).getTime() - new Date(workout.start).getTime()) / 60000 : null,
                strain: workout.score?.strain || null,
                average_hr: workout.score?.average_heart_rate || null,
                max_hr: workout.score?.max_heart_rate || null,
                calories: workout.score?.kilojoule ? Math.round(workout.score.kilojoule / 4.184) : null,
                zone_0_milli: workout.score?.zone_durations?.zone_zero_milli || 0,
                zone_1_milli: workout.score?.zone_durations?.zone_one_milli || 0,
                zone_2_milli: workout.score?.zone_durations?.zone_two_milli || 0,
                zone_3_milli: workout.score?.zone_durations?.zone_three_milli || 0,
                zone_4_milli: workout.score?.zone_durations?.zone_four_milli || 0,
                zone_5_milli: workout.score?.zone_durations?.zone_five_milli || 0,
                raw_data: workout
            };

            // Only include workout_label if not locked AND we have a label to set
            if (shouldUpdateLabel) {
                const inferredLabel = habitLabelMap[date] || null;
                if (inferredLabel) {
                    workoutPayload.workout_label = inferredLabel;
                }
                // If no label inferred, don't include workout_label — preserves existing DB value
            }

            const { error: workoutError } = await supabase.from('whoop_workouts').upsert(workoutPayload, { onConflict: 'user_id, whoop_id' });

            if (workoutError) {
                console.error(`[Whoop Sync] Failed to insert workout ${workout.id}:`, workoutError);
            } else {
                workoutCount++;
            }
        }

        // 5b. Clean up manual workout entries when real WHOOP workouts arrive for the same date
        const syncedDates = [...new Set((workoutData.records || []).map((w: any) =>
            toETDateString(new Date(w.start))
        ))];
        if (syncedDates.length > 0) {
            await supabase
                .from('whoop_workouts')
                .delete()
                .eq('user_id', userId)
                .in('date', syncedDates)
                .like('whoop_id', 'manual-%');
        }

        // Build recovery activity list from raw WHOOP data (since recovery activities are skipped from whoop_workouts)
        const todayStrCheck = toETDateString(new Date());
        const todayRecoveryActivities: { sport_name: string }[] = [];
        for (const workout of (workoutData.records || [])) {
            if (RECOVERY_SPORT_IDS.has(workout.sport_id)) {
                const wDate = toETDateString(new Date(workout.start));
                if (wDate === todayStrCheck) {
                    const rawName = workout.sport_name;
                    const name = (rawName && rawName !== 'activity')
                        ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
                        : sportMapping[workout.sport_id] || rawName || `Sport ${workout.sport_id}`;
                    todayRecoveryActivities.push({ sport_name: name });
                }
            }
        }

        // 6. Bidirectional Sync: Auto-complete daily gym tasks when workouts are synced
        // Check today's synced workouts and mark matching daily tasks as completed
        const todayStr = todayStrCheck;
        const WORKOUT_KEYWORDS = ['gym', 'push', 'pull', 'legs', 'leg', 'cardio', 'functional fitness', 'workout', 'lifting'];
        let tasksAutoCompleted = 0;

        // Get today's synced workouts
        const { data: todaysWorkouts } = await supabase
            .from('whoop_workouts')
            .select('sport_name, workout_label')
            .eq('user_id', userId)
            .eq('date', todayStr);

        if (todaysWorkouts && todaysWorkouts.length > 0) {
            // Get today's pending daily tasks
            const { data: pendingTasks } = await supabase
                .from('daily_tasks')
                .select('id, title')
                .eq('date', todayStr)
                .eq('status', 'Pending');

            if (pendingTasks && pendingTasks.length > 0) {
                for (const task of pendingTasks) {
                    const titleLower = task.title.toLowerCase();
                    const isGymTask = WORKOUT_KEYWORDS.some(kw => titleLower.includes(kw));

                    if (isGymTask) {
                        // Check if any workout matches this task more specifically
                        // e.g., "Push Day" task matches a workout labeled "Push Day" or any Functional Fitness workout
                        const hasMatchingWorkout = todaysWorkouts.some((w: any) => {
                            const sportLower = (w.sport_name || '').toLowerCase();
                            const labelLower = (w.workout_label || '').toLowerCase();

                            // Direct keyword match: task title contains sport name or label
                            if (sportLower && titleLower.includes(sportLower)) return true;
                            if (labelLower && titleLower.includes(labelLower.replace(' day', ''))) return true;

                            // Generic gym task matches any workout
                            if (titleLower === 'gym' || titleLower === 'workout') return true;

                            // Any Functional Fitness / weightlifting workout matches Push/Pull/Legs/Gym tasks
                            const strengthSports = ['functional fitness', 'weightlifting', 'powerlifting', 'bodybuilding', 'crossfit'];
                            if (strengthSports.includes(sportLower)) return true;

                            return false;
                        });

                        if (hasMatchingWorkout) {
                            const { error: taskUpdateError } = await supabase
                                .from('daily_tasks')
                                .update({ status: 'Completed' })
                                .eq('id', task.id);

                            if (!taskUpdateError) {
                                tasksAutoCompleted++;

                                // Extract split label from task title
                                // Handles "Push (Chest)", "Gym (Push Chest)", "Gym Push Chest", etc.
                                const taskTitle = task.title.trim();
                                // Direct lookup first — handles "Push (Chest)" format without regex mangling
                                let normalizedLabel = SPLIT_MAP[taskTitle] || SPLIT_MAP[taskTitle.toLowerCase()];
                                if (!normalizedLabel) {
                                    // Fallback: strip "Gym (...)" wrapper for legacy format
                                    const legacyMatch = taskTitle.match(/^gym\s*\((.+)\)$/i);
                                    const inner = legacyMatch ? legacyMatch[1].trim() : taskTitle.replace(/^gym\s*/i, '').trim();
                                    normalizedLabel = SPLIT_MAP[inner] || SPLIT_MAP[inner.toLowerCase()] || inner;
                                }
                                if (normalizedLabel) {

                                    // Find the matching unlabeled workout and set its label
                                    for (const w of todaysWorkouts) {
                                        if (!w.workout_label) {
                                            const sportLower = (w.sport_name || '').toLowerCase();
                                            const isStrength = ['functional fitness', 'weightlifting', 'powerlifting', 'bodybuilding', 'crossfit'].includes(sportLower);
                                            if (isStrength) {
                                                await supabase
                                                    .from('whoop_workouts')
                                                    .update({ workout_label: normalizedLabel, label_locked: true })
                                                    .eq('user_id', userId)
                                                    .eq('date', todayStr)
                                                    .eq('sport_name', w.sport_name)
                                                    .is('workout_label', null);
                                                break; // Only label one workout per task
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 6a-2. Auto-complete Sauna and Cold Plunge tasks when WHOOP detects those sports
        // Check both whoop_workouts (DB) and raw recovery activities (skipped from DB upsert)
        const allTodayActivities = [...(todaysWorkouts || []), ...todayRecoveryActivities];
        if (allTodayActivities.length > 0) {
            const { data: pendingSaunaCold } = await supabase
                .from('daily_tasks')
                .select('id, title')
                .eq('date', todayStr)
                .eq('status', 'Pending');

            if (pendingSaunaCold && pendingSaunaCold.length > 0) {
                const hasSaunaWorkout = allTodayActivities.some((w: any) => {
                    const sport = (w.sport_name || '').toLowerCase();
                    return sport.includes('sauna') || sport.includes('steam');
                });
                const hasIceBathWorkout = allTodayActivities.some((w: any) => {
                    const sport = (w.sport_name || '').toLowerCase();
                    return sport.includes('ice') || sport.includes('cold');
                });

                for (const task of pendingSaunaCold) {
                    const titleLower = task.title.toLowerCase();
                    if (hasSaunaWorkout && (titleLower.includes('sauna') || titleLower.includes('steam'))) {
                        await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', task.id);
                        tasksAutoCompleted++;
                    }
                    if (hasIceBathWorkout && (titleLower.includes('cold plunge') || titleLower.includes('ice bath') || titleLower.includes('cold'))) {
                        await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', task.id);
                        tasksAutoCompleted++;
                    }
                }
            }
        }

        // 6a-3. Auto-create + complete tasks for Sauna/Cold Plunge when WHOOP detects those sports
        if (allTodayActivities.length > 0) {
            const SPORT_TO_TASK: Record<string, { title: string; order: number }> = {
                'sauna': { title: 'Sauna', order: 51 },
                'steam room': { title: 'Steam Room', order: 53 },
                'steam': { title: 'Steam Room', order: 53 },
                'spa': { title: 'Sauna', order: 51 },
                'ice bath': { title: 'Cold Plunge', order: 52 },
                'ice-bath': { title: 'Cold Plunge', order: 52 },
                'cold water immersion': { title: 'Cold Plunge', order: 52 },
                'cold plunge': { title: 'Cold Plunge', order: 52 },
            };

            for (const w of allTodayActivities) {
                const sportLower = (w.sport_name || '').toLowerCase();
                const taskInfo = SPORT_TO_TASK[sportLower];
                if (!taskInfo) continue;

                // Check if a daily_task already exists for today with this title
                const { data: existingTasks } = await supabase
                    .from('daily_tasks')
                    .select('id, status')
                    .eq('date', todayStr)
                    .ilike('title', `%${taskInfo.title}%`)
                    .limit(1);

                if (existingTasks && existingTasks.length > 0) {
                    // Task exists — complete it if still pending
                    if (existingTasks[0].status === 'Pending') {
                        await supabase.from('daily_tasks').update({ status: 'Completed' }).eq('id', existingTasks[0].id);
                        tasksAutoCompleted++;
                    }
                } else {
                    // No task exists — create one as completed
                    const { error: insertErr } = await supabase.from('daily_tasks').insert({
                        date: todayStr,
                        title: taskInfo.title,
                        status: 'Completed',
                        is_one_off: false,
                        is_priority: false,
                        order: taskInfo.order,
                    });
                    if (!insertErr) tasksAutoCompleted++;
                }
            }
        }

        // 6b. Auto-create Gym/Sauna/Cold Plunge tasks on rest days if WHOOP detected a workout
        if (todaysWorkouts && todaysWorkouts.length > 0) {
            const strengthSports = ['functional fitness', 'weightlifting', 'powerlifting', 'bodybuilding', 'crossfit', 'box fitness'];
            const hasLiftingWorkout = todaysWorkouts.some((w: any) =>
                strengthSports.includes((w.sport_name || '').toLowerCase())
            );

            if (hasLiftingWorkout) {
                // Check if a workout task already exists for today
                const { data: existingWorkoutTasks } = await supabase
                    .from('daily_tasks')
                    .select('id')
                    .eq('date', todayStr)
                    .or('title.ilike.%gym%,title.ilike.%push%,title.ilike.%pull%,title.ilike.%legs%');

                if (!existingWorkoutTasks || existingWorkoutTasks.length === 0) {
                    // No workout task exists — try to determine the type from the WHOOP workout label
                    const liftWorkout = todaysWorkouts.find((w: any) =>
                        strengthSports.includes((w.sport_name || '').toLowerCase())
                    );
                    const workoutTitle = liftWorkout?.workout_label || 'Workout';

                    const { error: workoutInsertErr } = await supabase.from('daily_tasks').insert({
                        date: todayStr,
                        title: workoutTitle,
                        status: 'Completed',
                        is_one_off: false,
                        is_priority: false,
                        order: 50,
                    });
                    if (!workoutInsertErr) tasksAutoCompleted++;
                }
            }

            // Create Sauna/Cold Plunge companion tasks for ANY gym day (not just unscheduled ones)
            // These run regardless of hasLiftingWorkout — they're also created by 6a-3 when WHOOP detects steam/sauna directly
            if (hasLiftingWorkout) {
                // Create Sauna task if not already present
                {
                    const { data: existingSauna } = await supabase
                        .from('daily_tasks')
                        .select('id')
                        .eq('date', todayStr)
                        .ilike('title', '%sauna%');

                    if (!existingSauna || existingSauna.length === 0) {
                        await supabase.from('daily_tasks').insert({
                            date: todayStr,
                            title: 'Sauna',
                            status: 'Pending',
                            is_one_off: false,
                            is_priority: false,
                            order: 51,
                        });
                    }
                }

                // Create Cold Plunge task if not already present
                {
                    const { data: existingCold } = await supabase
                        .from('daily_tasks')
                        .select('id')
                        .eq('date', todayStr)
                        .or('title.ilike.%cold plunge%,title.ilike.%ice bath%');

                    if (!existingCold || existingCold.length === 0) {
                        await supabase.from('daily_tasks').insert({
                            date: todayStr,
                            title: 'Cold Plunge',
                            status: 'Pending',
                            is_one_off: false,
                            is_priority: false,
                            order: 52,
                        });
                    }
                }
            }
        }

        // 6c. Backfill workout_label from already-completed gym tasks
        // Covers case where user manually completed the gym task before WHOOP sync ran
        {
            const strengthSports = ['functional fitness', 'weightlifting', 'powerlifting', 'bodybuilding'];

            const { data: unlabeledWorkouts } = await supabase
                .from('whoop_workouts')
                .select('id, date, sport_name')
                .eq('user_id', userId)
                .eq('date', todayStr)
                .is('workout_label', null);

            if (unlabeledWorkouts && unlabeledWorkouts.length > 0) {
                // Find completed workout tasks (new format: "Push (Chest)" or legacy "Gym (Push Chest)")
                const { data: completedWorkoutTasks } = await supabase
                    .from('daily_tasks')
                    .select('title')
                    .eq('date', todayStr)
                    .eq('status', 'Completed')
                    .or('title.ilike.Gym%,title.ilike.Push%,title.ilike.Pull%,title.ilike.Legs%');

                if (completedWorkoutTasks && completedWorkoutTasks.length > 0) {
                    for (const w of unlabeledWorkouts) {
                        if (!strengthSports.includes((w.sport_name || '').toLowerCase())) continue;
                        const workoutTask = completedWorkoutTasks[0];
                        const title = workoutTask.title.trim();
                        // Direct lookup first — handles "Push (Chest)" without regex mangling
                        let normalizedLabel = SPLIT_MAP[title] || SPLIT_MAP[title.toLowerCase()];
                        if (!normalizedLabel) {
                            const legacyMatch = title.match(/^gym\s*\((.+)\)$/i);
                            const inner = legacyMatch ? legacyMatch[1].trim() : title.replace(/^gym\s*/i, '').trim();
                            normalizedLabel = SPLIT_MAP[inner] || SPLIT_MAP[inner.toLowerCase()] || inner;
                        }
                        if (normalizedLabel) {
                            await supabase
                                .from('whoop_workouts')
                                .update({ workout_label: normalizedLabel })
                                .eq('id', w.id);
                        }
                        break; // Only label one workout
                    }
                }
            }
        }

        // Trigger orchestrator when fresh recovery data arrives for today
        if (freshRecoveryToday) {
            try {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
                await fetch(`${baseUrl}/api/orchestrate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ whoopTriggered: true }),
                });
                console.log('[Whoop Sync] Fresh recovery detected — triggered orchestrator');
            } catch (err) {
                console.error('[Whoop Sync] Failed to trigger orchestrator:', err);
            }
        }

        return NextResponse.json({
            success: true,
            count: processedCount,
            workouts: workoutCount,
            tasksAutoCompleted,
            freshRecoveryToday,
            debug: {
                cycles_fetched: cycleData.records?.length || 0,
                recoveries_fetched: recoveryData.records?.length || 0,
                sleeps_fetched: sleepData.records?.length || 0,
                start_date_used: startDate,
                recent_recovery_raw: recoveryData.records?.[0]
            }
        });

    } catch (error: any) {
        console.error('Whoop Sync Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
