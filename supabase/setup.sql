-- ============================================================================
-- Project Athena — Complete Supabase Schema Setup Script
-- ============================================================================
-- Idempotent: safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- Single-user mode: RLS disabled on all tables
-- ============================================================================

-- Replace '00000000-0000-0000-0000-000000000000' with your Supabase auth user ID after creating your account
-- SINGLE_USER_ID: 00000000-0000-0000-0000-000000000000

-- ============================================================================
-- 1. WHOOP TABLES
-- ============================================================================

-- 1a. WHOOP OAuth Tokens
CREATE TABLE IF NOT EXISTS public.whoop_tokens (
    user_id UUID NOT NULL PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.whoop_tokens DISABLE ROW LEVEL SECURITY;

-- 1b. WHOOP Daily Biometrics
CREATE TABLE IF NOT EXISTS public.whoop_data (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    recovery_score INTEGER,
    strain FLOAT,
    sleep_hours FLOAT,
    sleep_performance INTEGER,
    sleep_consistency INTEGER,
    hrv FLOAT,
    resting_hr INTEGER,
    -- Detailed sleep metrics
    sleep_stage_light_minutes INTEGER,
    sleep_stage_deep_minutes INTEGER,
    sleep_stage_rem_minutes INTEGER,
    sleep_stage_awake_minutes INTEGER,
    sleep_efficiency_percentage INTEGER,
    sleep_latency_minutes INTEGER,
    sleep_disturbances INTEGER,
    sleep_need_baseline_minutes INTEGER,
    sleep_debt_minutes INTEGER,
    sleep_debt_corrected INTEGER,
    whoop_reported_sleep_debt_minutes INTEGER,
    -- Sleep timing
    sleep_start TIMESTAMPTZ,
    sleep_end TIMESTAMPTZ,
    -- Vitals
    respiratory_rate FLOAT,
    skin_temp_celsius FLOAT,
    spo2_percentage FLOAT,
    calories_burned INTEGER,
    max_hr INTEGER,
    average_hr INTEGER,
    -- Raw API response
    raw_data JSONB,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

ALTER TABLE public.whoop_data DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_whoop_data_user_date ON whoop_data(user_id, date);

-- Trigger: auto-update updated_at on whoop_data changes
CREATE OR REPLACE FUNCTION update_whoop_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whoop_data_updated_at ON whoop_data;
CREATE TRIGGER whoop_data_updated_at
    BEFORE UPDATE ON whoop_data
    FOR EACH ROW
    EXECUTE FUNCTION update_whoop_data_updated_at();

-- Trigger: corrected sleep debt (shifts reported debt to previous day)
CREATE OR REPLACE FUNCTION public.handle_sleep_debt_correction()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.whoop_data
    SET sleep_debt_corrected = NEW.whoop_reported_sleep_debt_minutes
    WHERE user_id = NEW.user_id
    AND date = (NEW.date - INTERVAL '1 day')::date;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sleep_debt_correction ON whoop_data;
CREATE TRIGGER trigger_sleep_debt_correction
AFTER INSERT OR UPDATE OF whoop_reported_sleep_debt_minutes ON whoop_data
FOR EACH ROW
EXECUTE FUNCTION public.handle_sleep_debt_correction();

-- 1c. WHOOP Workouts
CREATE TABLE IF NOT EXISTS public.whoop_workouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    whoop_id TEXT NOT NULL,
    date DATE NOT NULL,
    sport_id INTEGER,
    sport_name TEXT,
    workout_label TEXT,
    custom_title TEXT,
    duration_minutes FLOAT,
    strain FLOAT,
    average_hr INTEGER,
    max_hr INTEGER,
    calories INTEGER,
    -- HR Zone durations (milliseconds)
    zone_0_milli INTEGER,
    zone_1_milli INTEGER,
    zone_2_milli INTEGER,
    zone_3_milli INTEGER,
    zone_4_milli INTEGER,
    zone_5_milli INTEGER,
    -- Coach/logging
    label_locked BOOLEAN DEFAULT FALSE,
    notes TEXT,
    -- Raw API response
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, whoop_id)
);

ALTER TABLE public.whoop_workouts DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user_date ON whoop_workouts(user_id, date);
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_label_locked
    ON whoop_workouts(user_id, whoop_id, label_locked)
    WHERE label_locked = true;

-- ============================================================================
-- 2. HABITS & DAILY TRACKING
-- ============================================================================

-- 2a. Today Habits (habit definitions)
CREATE TABLE IF NOT EXISTS public.today_habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'good',
    frequency JSONB,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.today_habits DISABLE ROW LEVEL SECURITY;

-- 2b. Daily Summaries
CREATE TABLE IF NOT EXISTS public.daily_summaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    win_of_the_day TEXT,
    journal_entry TEXT,
    journal_prompts JSONB DEFAULT NULL,
    day_percentage INTEGER DEFAULT 0,
    recovery_score INTEGER DEFAULT 0,
    strain_score NUMERIC(4, 1) DEFAULT 0,
    sleep_score INTEGER DEFAULT 0,
    vitals_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_summaries DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date);

-- 2c. Daily Tasks
CREATE TABLE IF NOT EXISTS public.daily_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    summary_id UUID REFERENCES daily_summaries(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    is_priority BOOLEAN DEFAULT FALSE,
    is_one_off BOOLEAN DEFAULT FALSE,
    source_habit_id UUID REFERENCES today_habits(id) ON DELETE CASCADE,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_tasks DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(date);

-- Partial unique index: one habit per date
CREATE UNIQUE INDEX IF NOT EXISTS daily_tasks_date_habit_unique_idx
    ON daily_tasks (date, source_habit_id)
    WHERE source_habit_id IS NOT NULL;

-- ============================================================================
-- 3. PROJECTS & TASKS
-- ============================================================================

-- 3a. Projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    overview TEXT,
    status TEXT DEFAULT 'In Progress',
    progress INTEGER DEFAULT 0,
    emoji TEXT,
    color TEXT,
    display_order INTEGER,
    canvas_state JSONB DEFAULT '{}'::jsonb,
    deadline DATE,
    milestones JSONB DEFAULT '[]'::jsonb,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- 3b. Sections
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sections DISABLE ROW LEVEL SECURITY;

-- 3c. Tasks (project tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'To Do',
    priority TEXT DEFAULT 'Medium',
    due_date TIMESTAMPTZ,
    start_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    dependencies JSONB DEFAULT '[]'::jsonb,
    is_brain_dump_item BOOLEAN DEFAULT FALSE,
    display_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section ON tasks(section_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- 3d. Brain Dumps
CREATE TABLE IF NOT EXISTS public.brain_dumps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    content TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    status TEXT CHECK (status IN ('Pending Review', 'Applied', 'Discarded')) DEFAULT 'Pending Review',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.brain_dumps DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. BOOKS & LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.books (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    name TEXT NOT NULL,
    author TEXT,
    current_page INTEGER DEFAULT 0,
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    genres TEXT[],
    status TEXT NOT NULL CHECK (status IN ('Done', 'Paused', 'In Progress', 'Not started')) DEFAULT 'Not started',
    is_active BOOLEAN DEFAULT FALSE,
    color TEXT,
    year_finished TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.books DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_books_user_id ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_status ON books(user_id, status);
CREATE INDEX IF NOT EXISTS idx_books_is_active ON books(user_id, is_active);

-- Trigger: auto-update updated_at on books
CREATE OR REPLACE FUNCTION update_books_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS books_updated_at ON books;
CREATE TRIGGER books_updated_at
    BEFORE UPDATE ON books
    FOR EACH ROW
    EXECUTE FUNCTION update_books_updated_at();

-- RPC: set active book (ensures only one active at a time)
CREATE OR REPLACE FUNCTION set_active_book(book_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE books SET is_active = false WHERE is_active = true;
    UPDATE books SET is_active = true WHERE id = book_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. GOALS
-- ============================================================================

-- Generic updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5a. Yearly Goals
CREATE TABLE IF NOT EXISTS public.yearly_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    year INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Health', 'Growth', 'Athena', 'Work')),
    title TEXT NOT NULL,
    target_value INTEGER NOT NULL DEFAULT 1,
    current_value INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    linked_metric TEXT CHECK (linked_metric IN (
        'none', 'books_read', 'workouts', 'gym_sessions', 'project_streak',
        'avg_recovery', 'avg_sleep', 'avg_strain', 'perfect_days', 'workout_count'
    )) DEFAULT 'none',
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.yearly_goals DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_yearly_goals_user_year ON yearly_goals(user_id, year);

DROP TRIGGER IF EXISTS update_yearly_goals_updated_at ON yearly_goals;
CREATE TRIGGER update_yearly_goals_updated_at
    BEFORE UPDATE ON yearly_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5b. Monthly Goals
CREATE TABLE IF NOT EXISTS public.monthly_goals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    month DATE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Health', 'Growth', 'Athena', 'Work')),
    title TEXT NOT NULL,
    target_value INTEGER NOT NULL DEFAULT 1,
    current_value INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    linked_metric TEXT CHECK (linked_metric IN (
        'none', 'books_read', 'gym_sessions', 'project_streak',
        'avg_recovery', 'avg_sleep', 'avg_strain', 'perfect_days', 'workout_count'
    )) DEFAULT 'none',
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    yearly_goal_id UUID REFERENCES yearly_goals(id) ON DELETE CASCADE,
    carried_from_id UUID REFERENCES monthly_goals(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.monthly_goals DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_monthly_goals_user_month ON monthly_goals(user_id, month);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_yearly_goal_id ON monthly_goals(yearly_goal_id);

DROP TRIGGER IF EXISTS update_monthly_goals_updated_at ON monthly_goals;
CREATE TRIGGER update_monthly_goals_updated_at
    BEFORE UPDATE ON monthly_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. MEMORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    title TEXT,
    image_url TEXT,
    orientation TEXT DEFAULT 'landscape',
    description TEXT,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    gallery JSONB DEFAULT '[]'::jsonb,
    type TEXT DEFAULT 'highlight',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.memories DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_event_date ON memories(event_date);

-- ============================================================================
-- 7. AI REPORTS & COACH
-- ============================================================================

-- 7a. AI Reports
CREATE TABLE IF NOT EXISTS public.ai_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly', 'habit-insights')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report JSONB NOT NULL,
    data_snapshot JSONB,
    model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost NUMERIC(10, 6),
    generation_time_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('generating', 'completed', 'failed', 'dry_run')),
    error_message TEXT,
    is_preview BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, cadence, period_start, is_preview)
);

ALTER TABLE public.ai_reports DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_reports_cadence ON ai_reports(cadence, period_start DESC);

-- 7b. Coach Notes
CREATE TABLE IF NOT EXISTS public.coach_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workout_type TEXT NOT NULL,
    coach_type TEXT NOT NULL,
    notes JSONB NOT NULL DEFAULT '[]',
    exercise_suggestions JSONB NOT NULL DEFAULT '[]',
    weight_notes JSONB NOT NULL DEFAULT '{}',
    next_session_targets JSONB NOT NULL DEFAULT '{}',
    intensity TEXT,
    warm_up JSONB NOT NULL DEFAULT '{}',
    exercise_order JSONB NOT NULL DEFAULT '[]',
    warnings JSONB NOT NULL DEFAULT '[]',
    is_preview BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coach_notes DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_coach_notes_type ON coach_notes(workout_type, coach_type, created_at DESC);

-- 7c. Workout Weekly Plans
CREATE TABLE IF NOT EXISTS public.workout_weekly_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    week_start DATE NOT NULL,
    plan JSONB NOT NULL,
    reasoning TEXT,
    gap_alert TEXT,
    model TEXT DEFAULT 'claude-haiku-4-5-20251001',
    is_preview BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, week_start)
);

ALTER TABLE public.workout_weekly_plans DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_workout_weekly_plans_user_week ON workout_weekly_plans(user_id, week_start);

-- 7d. Workout Exercises (logged sets/reps/weights)
CREATE TABLE IF NOT EXISTS public.workout_exercises (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    workout_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    set_entries JSONB DEFAULT '[]'::jsonb,
    weight_unit TEXT DEFAULT 'lbs',
    notes TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workout_exercises DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_user ON workout_exercises(user_id);

-- ============================================================================
-- 8. GOLF
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.golf_rounds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    workout_id TEXT NOT NULL,
    course_name TEXT,
    holes JSONB DEFAULT '[]'::jsonb,
    total_score INTEGER,
    total_par INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.golf_rounds DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_golf_rounds_workout ON golf_rounds(workout_id);

-- ============================================================================
-- 9. QUOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    text TEXT NOT NULL,
    author TEXT NOT NULL,
    source TEXT,
    category TEXT,
    used_on DATE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.quotes DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_quotes_user ON quotes(user_id);

-- ============================================================================
-- 10. STORAGE BUCKETS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('memories', 'memories', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for memories bucket
DO $$
BEGIN
    -- Select policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Memories'
    ) THEN
        CREATE POLICY "Public Access to Memories"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'memories');
    END IF;

    -- Insert policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public upload memories'
    ) THEN
        CREATE POLICY "Public upload memories"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'memories');
    END IF;

    -- Delete policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public delete memory images'
    ) THEN
        CREATE POLICY "Public delete memory images"
            ON storage.objects FOR DELETE
            USING (bucket_id = 'memories');
    END IF;
END $$;

-- ============================================================================
-- 11. APP CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_config DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DONE
-- ============================================================================
