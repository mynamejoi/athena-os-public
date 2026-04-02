import { Card } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

// Helper Component for YearView - Monthly Performance Only

export const MonthlyPerformanceChart = ({ logs, year }: { logs: any[]; year: number }) => {
    // Aggregate by month
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const targetDate = new Date(year, i, 1);
        const targetMonthPrefix = format(targetDate, 'yyyy-MM');
        const monthLogs = logs.filter(l => l.date.startsWith(targetMonthPrefix));

        const avgScore = monthLogs.length > 0
            ? Math.round(monthLogs.reduce((acc, l) => acc + (l.habit_score || 0), 0) / monthLogs.length)
            : 0;

        return {
            name: format(targetDate, 'MMM'),
            score: avgScore,
            daysLogged: monthLogs.length
        };
    });

    // Calculate insights
    const validMonths = monthlyData.filter(m => m.daysLogged > 0);
    const avgScore = validMonths.length > 0
        ? Math.round(validMonths.reduce((sum, m) => sum + m.score, 0) / validMonths.length)
        : 0;
    const bestMonth = validMonths.reduce((best, m) => m.score > best.score ? m : best, validMonths[0] || { name: '-', score: 0 });
    const mostImproved = validMonths.reduce((result, m, i) => {
        if (i === 0) return result;
        const improvement = m.score - validMonths[i - 1].score;
        return improvement > result.improvement ? { month: m.name, improvement } : result;
    }, { month: '-', improvement: 0 });

    return (
        <Card className="bg-white/5 border-white/10 p-6">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-athena-gold" />
                Monthly Performance ({year})
            </h3>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs text-muted-foreground mb-1">Year Average</div>
                    <div className="text-2xl font-bold text-purple-400">{avgScore}%</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs text-muted-foreground mb-1">Best Month</div>
                    <div className="text-2xl font-bold text-cyan-400">{bestMonth.name}</div>
                    <div className="text-xs text-muted-foreground">{bestMonth.score}%</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <div className="text-xs text-muted-foreground mb-1">Biggest Jump</div>
                    <div className="text-2xl font-bold text-athena-gold">{mostImproved.month}</div>
                    <div className="text-xs text-muted-foreground">+{mostImproved.improvement}%</div>
                </div>
            </div>

            {/* Compact Monthly Grid */}
            <div className="grid grid-cols-12 gap-2">
                {monthlyData.map((month, i) => {
                    let bgClass = 'bg-stone-800/50';
                    let textClass = 'text-stone-500';
                    if (month.score >= 95) {
                        bgClass = 'bg-purple-600/20 border-purple-500/50';
                        textClass = 'text-purple-300';
                    } else if (month.score >= 90) {
                        bgClass = 'bg-cyan-600/20 border-cyan-500/50';
                        textClass = 'text-cyan-300';
                    } else if (month.score >= 80) {
                        bgClass = 'bg-blue-600/20 border-blue-500/50';
                        textClass = 'text-blue-300';
                    } else if (month.score >= 70) {
                        bgClass = 'bg-athena-gold/20 border-athena-gold/50';
                        textClass = 'text-athena-gold-bright';
                    } else if (month.score > 0) {
                        bgClass = 'bg-red-600/20 border-red-500/50';
                        textClass = 'text-red-300';
                    }

                    return (
                        <div
                            key={i}
                            className={`${bgClass} border rounded-lg p-3 text-center transition-all hover:scale-105 cursor-default`}
                        >
                            <div className="text-xs text-muted-foreground mb-1">{month.name}</div>
                            <div className={`text-lg font-bold ${textClass}`}>
                                {month.score > 0 ? `${month.score}%` : '-'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};
