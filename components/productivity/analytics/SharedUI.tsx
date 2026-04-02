
import React from 'react';

export const T = {
    bg: "#020204", surface: "rgba(14,12,10,0.9)", surfaceEl: "rgba(20,18,14,0.95)",
    glass: "rgba(22,20,16,0.7)", glassEdge: "rgb(var(--athena-gold-dim))",
    border: "rgba(50,44,34,0.5)", borderGold: "rgb(var(--athena-gold-dim))",
    gold: "rgb(var(--athena-gold))", goldBright: "rgb(var(--athena-gold-bright))", goldPale: "rgb(var(--athena-gold-pale))", goldRose: "rgb(var(--athena-gold-rose))",
    goldDim: "rgb(var(--athena-gold-dim))", goldMicro: "rgb(var(--athena-gold-dim))",
    text: "#ede8df", textWarm: "#c8bea8", textMuted: "#7a7060", textDim: "#4a4238",
    green: "#6bbd6b", greenBright: "#8dd88d", greenDim: "#3a6b3a",
    red: "#c45040", redSoft: "#d4706a",
    purple: "#a080d0", purpleBright: "#c0a0f0", purpleDim: "#6b5090",
    blue: "#5b8fd0", blueBright: "#80b0f0",
    orange: "#d4956b", yellow: "#d4c040",
    indigo: "#6050b0", cyan: "#50b8c8",
};

export const NoiseSVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`;

export function fmtTime(dec: number) {
    let h = Math.floor(dec); let m = Math.round((dec - h) * 60);
    if (h >= 24) h -= 24;
    const ap = h >= 12 ? "PM" : "AM";
    return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")} ${ap}`;
}

export const GlassCard = ({ children, style = {}, glow }: { children: React.ReactNode, style?: React.CSSProperties, glow?: string }) => (
    <div style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, boxShadow: glow ? `0 0 30px ${glow}, inset 0 1px 0 ${T.glassEdge}` : `inset 0 1px 0 ${T.glassEdge}`, position: "relative", overflow: "hidden", ...style }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: 40, height: 40, background: `linear-gradient(135deg,${T.goldMicro},transparent)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
);

export const Label = ({ children, color }: { children: React.ReactNode, color?: string }) => (
    <div style={{ fontSize: 9, color: color || T.textMuted, letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "var(--font-manrope), sans-serif", fontWeight: 600, marginBottom: 12 }}>{children}</div>
);

export const Metric = ({ label, value, sub, color }: { label: string, value: string | number, sub?: string, color: string }) => (
    <div style={{ padding: "14px 16px", background: T.glass, borderRadius: 12, border: `1px solid ${T.border}`, borderLeft: `3px solid ${color}`, minWidth: 0 }}>
        <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "var(--font-manrope), sans-serif", marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 500, color, fontFamily: "var(--font-playfair), serif", lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 9, color: T.textDim, fontFamily: "var(--font-manrope), sans-serif", marginTop: 4 }}>{sub}</div>}
    </div>
);

export const Tip = ({ active, payload, label, formatter }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", fontFamily: "var(--sans)" }}>
            <div style={{ fontSize: 11, color: T.text, fontWeight: 600, marginBottom: 6 }}>{label instanceof Date ? label.toLocaleDateString() : label}</div>
            {payload.map((p: any, i: number) => (
                <div key={i} style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                    <span style={{ color: T.textMuted }}>{p.name}:</span>
                    <span style={{ color: p.color, fontWeight: 600 }}>{formatter ? formatter(p.value, p.name) : p.value}</span>
                </div>
            ))}
        </div>
    );
};

export function DonutRing({ segments, total, centerValue, centerLabel, size = 120 }: { segments: any[], total: number, centerValue: string, centerLabel: string, size?: number }) {
    const elements: React.ReactNode[] = [];
    let offset = 0;

    segments.forEach((seg, i) => {
        const pct = seg.value / total;
        const dash = `${pct * 314} ${314 - pct * 314}`;
        elements.push(
            <circle key={i} cx="60" cy="60" r="50" fill="none" stroke={seg.color} strokeWidth="12"
                strokeDasharray={dash} strokeDashoffset={-offset * 314}
                transform="rotate(-90 60 60)" opacity={0.85}
                style={{ filter: `drop-shadow(0 0 4px ${seg.color}40)` }} />
        );
        offset += pct;
    });

    return (
        <div style={{ position: "relative", width: size, height: size }}>
            <svg viewBox="0 0 120 120" width={size} height={size}>
                {elements}
                <text x="60" y="56" textAnchor="middle" fontSize="20" fill={T.text} fontFamily="var(--display)" fontWeight="500">{centerValue}</text>
                <text x="60" y="72" textAnchor="middle" fontSize="8" fill={T.textMuted} fontFamily="var(--sans)">{centerLabel}</text>
            </svg>
        </div>
    );
}

export function BarRow({ items, maxVal }: { items: any[], maxVal: number }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((z, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, color: T.textMuted, fontFamily: "var(--sans)", width: 80, flexShrink: 0 }}>{z.label}</span>
                    <div style={{ flex: 1, height: 8, background: `${T.textDim}15`, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${(z.count / maxVal) * 100}%`, height: "100%", background: z.color, borderRadius: 4, transition: "width 0.6s ease" }} />
                    </div>
                    <span style={{ fontSize: 10, color: z.color, fontFamily: "var(--display)", fontWeight: 600, width: 32, textAlign: "right" }}>{z.count}d</span>
                </div>
            ))}
        </div>
    );
}
