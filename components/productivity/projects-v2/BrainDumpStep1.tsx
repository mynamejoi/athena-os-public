"use client";

import { useState, useRef, useEffect } from 'react';
import { T, BrainIcon, SparkleIcon, ArrowRightIcon, TypingDots } from './BrainDumpTheme';

interface BrainDumpStep1Props {
    onNext: (text: string) => void;
}

export function BrainDumpStep1({ onNext }: BrainDumpStep1Props) {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [charCount, setCharCount] = useState(0);

    useEffect(() => {
        if (textareaRef.current) textareaRef.current.focus();
    }, []);

    const handleNext = () => {
        setLoading(true);
        setTimeout(() => onNext(text), 900);
    };

    const suggestions = [
        "Finish the dashboard redesign by Friday",
        "Review pull requests for the API team",
        "Schedule 1:1 with Sarah about Q2 planning",
        "Write docs for the new tracking system",
    ];

    const insertSuggestion = (s: string) => {
        setText((prev) => (prev ? prev + "\n" + s : s));
        setCharCount((prev) => prev + (prev ? 1 : 0) + s.length);
        textareaRef.current?.focus();
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 28px 28px" }}>
            {/* Textarea */}
            <div style={{
                flex: 1, position: "relative", borderRadius: 0,
                border: `1px solid ${text ? T.borderActive : T.border}`,
                background: "transparent", transition: "border-color 0.3s ease",
                overflow: "hidden",
            }}>
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setCharCount(e.target.value.length); }}
                    placeholder="What needs to happen? Tasks, ideas, deadlines — just let it flow..."
                    style={{
                        width: "100%", height: "100%", resize: "none",
                        background: "transparent", border: "none", outline: "none",
                        color: T.text, fontSize: 15, lineHeight: 1.7,
                        padding: "20px 20px 40px", fontFamily: "inherit",
                        boxSizing: "border-box",
                    }}
                />
                {/* Character count */}
                <div style={{
                    position: "absolute", bottom: 12, right: 16,
                    fontSize: 11, color: T.textDim, fontVariantNumeric: "tabular-nums",
                }}>
                    {charCount > 0 && `${charCount} chars`}
                </div>
                {/* Glow line */}
                {text && (
                    <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                        background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)`,
                        opacity: 0.4,
                    }} />
                )}
            </div>



            {/* Footer */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: T.textDim, display: "flex", alignItems: "center", gap: 6 }}>
                    <SparkleIcon size={14} color={T.textDim} />
                    AI will extract tasks, dates & effort
                </div>
                <button
                    onClick={handleNext}
                    disabled={!text.trim() || loading}
                    style={{
                        padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                        background: text.trim() ? T.gold : T.textDim,
                        color: text.trim() ? T.bg : T.textMuted,
                        border: "none", cursor: text.trim() ? "pointer" : "not-allowed",
                        display: "flex", alignItems: "center", gap: 8,
                        transition: "all 0.3s ease",
                        opacity: loading ? 0.7 : 1,
                        letterSpacing: "0.01em",
                    }}
                >
                    {loading ? (
                        <>
                            <span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}>
                                <SparkleIcon size={14} color={T.bg} />
                            </span>
                            Analyzing
                            <TypingDots />
                        </>
                    ) : (
                        <>
                            Continue
                            <ArrowRightIcon size={14} />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
