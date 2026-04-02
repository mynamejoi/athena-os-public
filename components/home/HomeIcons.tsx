"use client";

import { motion } from "framer-motion";

// --- 3D DNA Strand (Health) ---
export function SpinningDNA() {
    return (
        <div className="relative w-20 h-28 flex items-center justify-center [perspective:800px]">
            <motion.div
                className="w-full h-full relative [transform-style:preserve-3d]"
                animate={{ rotateY: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
                {Array.from({ length: 8 }).map((_, i) => {
                    const y = -40 + (i * 12);
                    const rotation = i * 45;
                    return (
                        <div
                            key={i}
                            className="absolute top-1/2 left-1/2 -ml-6 -mt-[1px] w-12 h-[2px]"
                            style={{
                                transform: `translateY(${y}px) rotateY(${rotation}deg)`,
                                backgroundColor: "rgb(var(--athena-gold) / 0.8)",
                            }}
                        >
                            <div
                                className="absolute left-0 top-1/2 -mt-1 -ml-1 w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: "rgb(var(--athena-gold))", boxShadow: "0 0 8px rgb(var(--athena-gold) / 0.4)" }}
                            />
                            <div
                                className="absolute right-0 top-1/2 -mt-1 -mr-1 w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: "rgb(var(--athena-gold))", boxShadow: "0 0 8px rgb(var(--athena-gold) / 0.4)" }}
                            />
                        </div>
                    )
                })}
            </motion.div>
        </div>
    )
}

// --- 3D Tesseract / Hypercube (Development) ---
export function TesseractIcon() {
    return (
        <div className="relative w-24 h-24 flex items-center justify-center [perspective:1000px]">
            {/* Outer Cube */}
            <motion.div
                className="relative w-12 h-12 flex items-center justify-center [transform-style:preserve-3d]"
                animate={{ rotateX: 395, rotateY: 405 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                style={{ rotateX: 35, rotateY: 45 }}
            >
                {/* Faces */}
                {[
                    "rotateY(0deg) translateZ(24px)",
                    "rotateY(90deg) translateZ(24px)",
                    "rotateY(180deg) translateZ(24px)",
                    "rotateY(-90deg) translateZ(24px)",
                    "rotateX(90deg) translateZ(24px)",
                    "rotateX(-90deg) translateZ(24px)"
                ].map((t, i) => (
                    <div
                        key={i}
                        className="absolute inset-0"
                        style={{
                            transform: t,
                            border: "1px solid rgb(var(--athena-gold))",
                            boxShadow: "0 0 6px rgb(var(--athena-gold) / 0.3)",
                        }}
                    />
                ))}

                {/* Inner Cube - Counter Rotating */}
                <motion.div
                    className="absolute w-6 h-6 flex items-center justify-center [transform-style:preserve-3d]"
                    animate={{ rotateY: -360, rotateX: -360 }}
                    transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                >
                    {[
                        "rotateY(0deg) translateZ(12px)",
                        "rotateY(90deg) translateZ(12px)",
                        "rotateY(180deg) translateZ(12px)",
                        "rotateY(-90deg) translateZ(12px)",
                        "rotateX(90deg) translateZ(12px)",
                        "rotateX(-90deg) translateZ(12px)"
                    ].map((t, i) => (
                        <div
                            key={`inner-${i}`}
                            className="absolute inset-0"
                            style={{
                                transform: t,
                                border: "1px solid rgb(var(--athena-gold))",
                            }}
                        />
                    ))}
                </motion.div>
            </motion.div>
        </div>
    )
}
