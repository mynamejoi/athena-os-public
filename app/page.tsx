'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Brain, Heart, Sparkle } from 'lucide-react';
import { useWhoopMode } from '@/components/providers/WhoopModeProvider';
import { format } from 'date-fns';
import { QuoteWidget } from '@/components/productivity/QuoteWidget';
import { SpinningDNA, TesseractIcon } from '@/components/home/HomeIcons';
import { ACCENT_PALETTES } from '@/lib/theme-colors';
import { useThemeColor } from '@/components/providers/ThemeColorProvider';


interface HomeStats {
  health: {
    recovery: number | null;
    strain: number | null;
    sleepHours: number | null;
    sleepScore: number | null;
    hrv: number | null;
    restingHr: number | null;
    avgHrv: number | null;
    avgRhr: number | null;
  };
  development: {
    habitsCompleted: number;
    habitsTotal: number;
    projectTasksDueToday: number;
    athenaStreak: number;
    longestStreak: number;
    activeProjectCount: number;
    activeBooksCount: number;
    workoutsCompleted: number;
    workoutsPlanned: number;
    projectTasksThisWeekDone: number;
    projectTasksThisWeekTotal: number;
    projectTasksLastWeekDone: number;
  };
  averages: {
    dayScore: number | null;
    habitsRemaining: number | null;
    hrv: number | null;
    rhr: number | null;
    tasksDuePerDay: number | null;
    workoutsPerWeek: number;
  };
}

/* ── Desktop stat row (unchanged) ── */
function StatRow({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-0">
      <span className="text-athena-text-muted tracking-wide">{label}</span>
      <span className="text-athena-text-primary font-mono tabular-nums transition-colors duration-300 group-hover:text-athena-gold">
        {value !== null && value !== undefined ? (
          <>
            {value}
            {unit && <span className="text-athena-text-muted text-xs ml-0.5 group-hover:text-athena-gold-dim transition-colors duration-300">{unit}</span>}
          </>
        ) : (
          <span className="text-athena-text-muted/40">--</span>
        )}
      </span>
    </div>
  );
}

/* ── WHOOP-style ring gauge for mobile ── */
function RingGauge({ value, max, label, color, size = 58, strokeWidth = 6, showPercent }: {
  value: number | null;
  max: number;
  label: string;
  color: string;
  size?: number;
  strokeWidth?: number;
  showPercent?: boolean;
}) {
  const trackWidth = strokeWidth + 2;
  const radius = (size - trackWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);

  const displayValue = value != null
    ? (max === 21 ? `${value.toFixed(1)}` : `${Math.round(value)}`)
    : '--';

  // Scale center text based on ring size
  const centerTextSize = size >= 96 ? 'text-[32px] -mt-1' : size >= 80 ? 'text-2xl' : 'text-sm';
  const percentSize = size >= 96 ? 'text-sm' : 'text-[10px]';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Thick dark background track (like WHOOP) */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={trackWidth}
          />
          {/* Active arc */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${centerTextSize} font-serif font-bold text-white tabular-nums leading-none`}>
            {displayValue}
            {showPercent && value != null && <span className={`${percentSize} text-white/60`}>%</span>}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-white/40 uppercase tracking-[0.15em] font-medium">{label}</span>
    </div>
  );
}

/* ── Mobile stat tile (glass box inside card grid) ── */
function StatTile({ value, label, detail }: {
  value: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl bg-white/[0.03] border border-white/[0.06] py-2.5 px-2">
      <span className="text-lg font-serif font-bold tabular-nums leading-tight text-athena-text-warm">
        {value}
      </span>
      <span className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">{label}</span>
      {detail && (
        <span className="text-[9px] text-white/20 italic mt-0.5">{detail}</span>
      )}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const { accentId, setAccentColor } = useThemeColor();
  const { whoopEnabled } = useWhoopMode();

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    fetch('/api/home/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});

    return () => clearInterval(timer);
  }, []);

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (!mounted) return null;

  const h = stats?.health;
  const d = stats?.development;
  const avg = stats?.averages;

  // Recovery zone helpers — uses athena-green from tailwind config
  const recoveryColor = h?.recovery != null
    ? (h.recovery >= 67 ? 'rgb(74,222,128)' : h.recovery >= 34 ? 'rgb(250,204,21)' : 'rgb(239,68,68)')
    : 'rgba(255,255,255,0.15)';
  const recoveryZone = h?.recovery != null
    ? (h.recovery >= 67 ? 'Green zone' : h.recovery >= 34 ? 'Yellow zone' : 'Red zone')
    : null;

  const sleepFormatted = h?.sleepHours != null
    ? `${Math.floor(h.sleepHours)}h ${Math.round((h.sleepHours % 1) * 60)}m`
    : '--';

  const dayScore = d && d.habitsTotal > 0
    ? Math.round((d.habitsCompleted / d.habitsTotal) * 100)
    : null;

  return (
    <div className="min-h-screen w-full bg-athena-bg flex items-center justify-center relative overflow-hidden font-sans selection:bg-athena-gold-dim/30">
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[400px] md:w-[900px] md:h-[500px] bg-athena-gold/5 rounded-full blur-[100px] md:blur-[150px]" />
      </div>

      {/* Edge lines */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-athena-border to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-athena-border to-transparent" />

      {/* ════════════════════════ MOBILE LAYOUT ════════════════════════ */}
      <div className="relative z-10 w-full flex flex-col items-center justify-center px-4 pt-[max(env(safe-area-inset-top),12px)] pb-[max(env(safe-area-inset-bottom),8px)] md:hidden min-h-screen">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="w-full flex flex-col items-center gap-3"
        >
          {/* ── Clock ── */}
          <div className="flex flex-col items-center" suppressHydrationWarning>
            <div className="flex items-baseline justify-center leading-none">
              <span className="text-7xl font-serif font-light text-athena-gold tabular-nums">
                {format(currentTime, 'h')}
              </span>
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="text-6xl font-serif font-light text-athena-gold/50 mx-0.5"
              >
                :
              </motion.span>
              <span className="text-7xl font-serif font-light text-athena-gold tabular-nums">
                {format(currentTime, 'mm')}
              </span>
              <span className="text-xl font-serif text-athena-gold/30 ml-1.5 self-end mb-2">
                {format(currentTime, 'a')}
              </span>
            </div>
            <p className="text-xs text-white/30 uppercase tracking-[0.25em] mt-2">
              {format(currentTime, 'EEEE, MMMM d')}
            </p>
          </div>

          {/* ── Health Card ── */}
          <div onClick={() => router.push('/productivity?tab=today-v2&view=health-v2')} className="w-full cursor-pointer">
            <motion.div
              whileTap={{ scale: 0.97 }}
              className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-3 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-athena-gold/8 flex items-center justify-center">
                    <Heart className="w-3 h-3 text-athena-gold-dim" />
                  </div>
                  <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em]">Health</h2>
                </div>
                <svg className="w-4 h-4 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile value={dayScore != null ? `${dayScore}%` : '--'} label="Day Score" detail={avg?.dayScore != null ? `avg ${avg.dayScore}%` : undefined} />
                <StatTile value={d ? `${d.habitsCompleted}/${d.habitsTotal}` : '--'} label="Habits" />
                <StatTile value={h?.hrv != null ? `${Math.round(h.hrv)}` : '--'} label="HRV" detail={h?.avgHrv != null ? `avg ${h.avgHrv}ms` : undefined} />
                <StatTile value={h?.restingHr != null ? `${Math.round(h.restingHr)}` : '--'} label="RHR" detail={h?.avgRhr != null ? `avg ${h.avgRhr}bpm` : undefined} />
              </div>
            </motion.div>
          </div>

          {/* ── Development Card ── */}
          <div onClick={() => router.push('/development-v2?tab=projects')} className="w-full cursor-pointer">
            <motion.div
              whileTap={{ scale: 0.97 }}
              className="relative rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-3 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-athena-gold/8 flex items-center justify-center">
                    <Sparkle className="w-3 h-3 text-athena-gold-dim" />
                  </div>
                  <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.15em]">Development</h2>
                </div>
                <svg className="w-4 h-4 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile value={d?.projectTasksDueToday != null ? `${d.projectTasksDueToday}` : '--'} label="Due Today" />
                <StatTile value={d ? `${d.workoutsCompleted}/${d.workoutsPlanned}` : '--'} label="Workouts" detail={avg ? `avg ${avg.workoutsPerWeek}/wk` : undefined} />
                <StatTile value={d ? `${d.projectTasksThisWeekDone}/${d.projectTasksThisWeekTotal}` : '--'} label="Tasks Done" detail="this week" />
                <StatTile value={d?.athenaStreak != null ? `${d.athenaStreak}d` : '--'} label="Streak" detail={d ? `best ${Math.max(d.longestStreak, d.athenaStreak)}d` : undefined} />
              </div>
            </motion.div>
          </div>

          {/* ── Quote ── */}
          <div className="w-full">
            <QuoteWidget />
          </div>

          {/* ── Footer ── */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-0.5">
              {ACCENT_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  onClick={() => setAccentColor(palette.id)}
                  className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center"
                  title={palette.label}
                >
                  <div
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      palette.id === accentId
                        ? 'ring-[1.5px] ring-white/50 ring-offset-[1.5px] ring-offset-athena-bg scale-125'
                        : 'opacity-30'
                    }`}
                    style={{ background: palette.DEFAULT }}
                  />
                </button>
              ))}
              <button
                onClick={handleSignOut}
                className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center active:opacity-60 transition-opacity"
                title="Sign out"
              >
                <Brain className="w-3.5 h-3.5 text-athena-gold/15" />
              </button>
            </div>
            <p className="text-[9px] text-athena-gold/15 uppercase tracking-[0.25em] font-serif pb-1">
              Project Athena
            </p>
          </div>
        </motion.div>
      </div>

      {/* ════════════════════════ DESKTOP LAYOUT ════════════════════════ */}
      <div className="relative z-10 w-full max-w-4xl hidden md:flex flex-col items-center justify-center gap-4 px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-4 mb-8"
        >
          {/* Time and Date */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-athena-text-muted text-2xl font-light tracking-[0.2em] w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <span className="text-right font-serif">{format(currentTime, 'h:mm:ss a')}</span>
            <span className="text-athena-gold-dim">&bull;</span>
            <span className="text-left font-serif">{format(currentTime, 'MM.dd.yyyy')}</span>
          </div>

          {/* Brain + Title */}
          <div className="flex items-center gap-4 justify-center">
            <div className="h-[2px] w-16 bg-gradient-to-r from-transparent to-athena-gold opacity-60" />
            <button
              onClick={handleSignOut}
              className="p-1 hover:bg-athena-gold/10 active:bg-athena-gold/20 rounded-full transition-colors"
              title="Sign out"
            >
              <Brain className="w-8 h-8 text-athena-gold shrink-0 hover:drop-shadow-[0_0_10px_rgb(var(--athena-gold))] transition-all" />
            </button>
            <div className="h-[2px] w-16 bg-gradient-to-l from-transparent to-athena-gold opacity-60" />
          </div>
          <h1 className="text-3xl font-serif text-athena-gold tracking-[0.4em] uppercase">
            Project Athena
          </h1>
        </motion.div>

        {/* Portal Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-row items-stretch justify-center gap-6 w-full"
        >
          {/* Health Card */}
          <div onClick={() => router.push('/productivity?tab=today-v2&view=health-v2')} className="group flex-1 max-w-sm cursor-pointer">
            <motion.div
              initial="idle"
              whileHover="active"
              className="relative h-full border border-athena-border/50 rounded-xl bg-athena-bg-raised/50 backdrop-blur-sm p-6 transition-all duration-500 group-hover:border-athena-gold/30 group-hover:shadow-[0_0_40px_-10px_rgb(var(--athena-gold))] group-hover:scale-[1.02] active:scale-[0.98] active:border-athena-gold/20"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-athena-gold/0 to-transparent group-hover:via-athena-gold/40 transition-all duration-500 rounded-t-xl" />
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-lg font-serif tracking-[0.2em] text-athena-text-warm group-hover:text-athena-text-primary transition-colors uppercase">Health</h2>
                  <p className="text-xs text-athena-text-muted tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500">Biological & Habits</p>
                </div>
                <div className="transform-gpu scale-75 -mr-2 -mt-2"><SpinningDNA /></div>
              </div>
              <div className="space-y-2.5">
                {whoopEnabled && (
                  <>
                    <StatRow label="Recovery" value={h?.recovery ?? null} unit="%" />
                    <StatRow label="Strain" value={h?.strain !== null && h?.strain !== undefined ? Number(h.strain).toFixed(1) : null} />
                    <StatRow label="Sleep" value={h?.sleepHours !== null && h?.sleepHours !== undefined ? Number(h.sleepHours).toFixed(1) : null} unit="h" />
                    <StatRow label="Habits" value={d ? `${d.habitsCompleted}/${d.habitsTotal}` : null} />
                  </>
                )}
                {!whoopEnabled && (
                  <>
                    <StatRow label="Habits" value={d ? `${d.habitsCompleted}/${d.habitsTotal}` : null} />
                    <StatRow label="Day Score" value={d && d.habitsTotal > 0 ? `${Math.round((d.habitsCompleted / d.habitsTotal) * 100)}` : null} unit="%" />
                    <StatRow label="Streak" value={d?.athenaStreak != null ? `${d.athenaStreak}d` : null} />
                    <p className="text-[10px] text-athena-text-muted/40 pt-2">Connect WHOOP for recovery data</p>
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {/* Development Card */}
          <div onClick={() => router.push('/development-v2?tab=projects')} className="group flex-1 max-w-sm cursor-pointer">
            <motion.div
              initial="idle"
              whileHover="active"
              className="relative h-full border border-athena-border/50 rounded-xl bg-athena-bg-raised/50 backdrop-blur-sm p-6 transition-all duration-500 group-hover:border-athena-gold/30 group-hover:shadow-[0_0_40px_-10px_rgb(var(--athena-gold))] group-hover:scale-[1.02] active:scale-[0.98] active:border-athena-gold/20"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-athena-gold/0 to-transparent group-hover:via-athena-gold/40 transition-all duration-500 rounded-t-xl" />
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-lg font-serif tracking-[0.2em] text-athena-text-warm group-hover:text-athena-text-primary transition-colors uppercase">Development</h2>
                  <p className="text-xs text-athena-text-muted tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-500">Engineering & Skills</p>
                </div>
                <div className="transform-gpu scale-75 -mr-2 -mt-2"><TesseractIcon /></div>
              </div>
              <div className="space-y-2.5">
                <StatRow label="Due Today" value={d?.projectTasksDueToday ?? null} />
                {whoopEnabled && (
                  <>
                    <StatRow label="Habits" value={d ? `${d.habitsCompleted}/${d.habitsTotal}` : null} />
                    <StatRow label="Streak" value={d?.athenaStreak != null ? `${d.athenaStreak}d` : null} />
                    <StatRow label="Day" value={d && d.habitsTotal > 0 ? `${Math.round((d.habitsCompleted / d.habitsTotal) * 100)}` : null} unit="%" />
                  </>
                )}
                {!whoopEnabled && (
                  <>
                    <StatRow label="Projects" value={d?.activeProjectCount ?? null} />
                    <StatRow label="Books" value={d?.activeBooksCount ?? null} />
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Quote */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="w-full max-w-3xl mt-8"
        >
          <QuoteWidget />
        </motion.div>

        {/* Accent Color */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="flex flex-wrap items-center justify-center gap-3 mt-6"
        >
          {ACCENT_PALETTES.map((palette) => (
            <button
              key={palette.id}
              onClick={() => setAccentColor(palette.id)}
              className="group relative flex flex-col items-center gap-1.5 p-2 min-w-[44px] min-h-[44px] justify-center"
              title={palette.label}
            >
              <div
                className={`w-5 h-5 rounded-full transition-all duration-300 ${
                  palette.id === accentId
                    ? "ring-2 ring-white/60 ring-offset-2 ring-offset-athena-bg scale-110"
                    : "opacity-40 hover:opacity-80 hover:scale-110"
                }`}
                style={{ background: palette.DEFAULT }}
              />
              <span className={`text-[8px] tracking-widest uppercase transition-opacity duration-300 ${
                palette.id === accentId ? "text-athena-text-muted opacity-100" : "opacity-0 group-hover:opacity-60 text-athena-text-dim"
              }`}>
                {palette.label}
              </span>
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
