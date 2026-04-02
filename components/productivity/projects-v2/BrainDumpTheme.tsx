import React from 'react';

// ─── Design Tokens ───
export const T = {
    bg: "#020204",
    surface: "#0e0c0a",
    surfaceHover: "#141210",
    card: "#0b0a08",
    cardHover: "#12100d",
    border: "rgba(255,255,255,0.08)",
    borderActive: "rgb(var(--athena-gold-dim))",
    gold: "rgb(var(--athena-gold))",
    goldMuted: "rgb(var(--athena-gold-dim))",
    goldSubtle: "rgb(var(--athena-gold-dim))",
    green: "#34d399",
    greenMuted: "rgba(52,211,153,0.15)",
    blue: "#60a5fa",
    blueMuted: "rgba(96,165,250,0.15)",
    red: "#f87171",
    redMuted: "rgba(248,113,113,0.15)",
    yellow: "rgb(var(--athena-gold))",
    yellowMuted: "rgb(var(--athena-gold-dim))",
    text: "#e5e5e5",
    textMuted: "#737373",
    textDim: "#525252",
};

export const effortConfig = {
    quick: { label: "Quick", color: T.green, bg: T.greenMuted, minutes: "~15m" },
    short: { label: "Short", color: T.blue, bg: T.blueMuted, minutes: "~30m" },
    medium: { label: "Medium", color: T.yellow, bg: T.yellowMuted, minutes: "~1-2h" },
    large: { label: "Large", color: T.red, bg: T.redMuted, minutes: "~3h+" },
};

// ─── Icons ───
export const SparkleIcon = ({ size = 16, color = T.gold }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
);

export const BrainIcon = ({ size = 16, color = T.gold }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a5 5 0 0 1 4.39 2.61A4.5 4.5 0 0 1 20 9a4 4 0 0 1-.78 7.67A3.5 3.5 0 0 1 16 20H8a3.5 3.5 0 0 1-3.22-3.33A4 4 0 0 1 4 9a4.5 4.5 0 0 1 3.61-4.39A5 5 0 0 1 12 2z" />
        <path d="M12 2v20" opacity="0.3" />
    </svg>
);

export const ArrowRightIcon = ({ size = 16, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
);

export const ArrowLeftIcon = ({ size = 16, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
);

export const CheckIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

export const CalendarIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

export const ZapIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
);

export const PlusIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

export const XIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

export const RocketIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
);

export const ClockIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
);

export const ChevronDownIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

export const RefreshIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);

export const TrashIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

export const LayersIcon = ({ size = 14, color = "currentColor" }: { size?: number, color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
);

// ─── Shared Components ───
export function TypingDots() {
    return (
        <span style={{ display: "inline-flex", gap: 3, marginLeft: 4 }}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        width: 4, height: 4, borderRadius: "50%",
                        background: T.gold, opacity: 0.6,
                        animation: `pulse-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
                    }}
                />
            ))}
            <style>{`
                @keyframes pulse-dot {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </span>
    );
}

export function StepIndicator({ current, steps }: { current: number, steps: { label: string, sub: string }[] }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "20px 28px 0" }}>
            {steps.map((step, i) => {
                const isActive = i === current;
                const isComplete = i < current;
                return (
                    <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                                style={{
                                    width: 28, height: 28, borderRadius: "50%",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 11, fontWeight: 600,
                                    background: isComplete ? T.gold : isActive ? T.goldSubtle : "transparent",
                                    border: `1.5px solid ${isComplete ? T.gold : isActive ? T.gold : T.border}`,
                                    color: isComplete ? T.bg : isActive ? T.gold : T.textDim,
                                    transition: "all 0.4s ease",
                                }}
                            >
                                {isComplete ? <CheckIcon size={12} color={T.bg} /> : i + 1}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
                                    color: isActive ? T.text : isComplete ? T.gold : T.textDim,
                                    transition: "color 0.3s ease",
                                }}>
                                    {step.label}
                                </span>
                                <span style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{step.sub}</span>
                            </div>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{
                                flex: 1, height: 1, marginLeft: 16, marginRight: 16,
                                background: isComplete ? T.gold : T.border,
                                transition: "background 0.4s ease",
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
