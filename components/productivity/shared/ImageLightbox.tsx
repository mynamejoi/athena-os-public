'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageLightboxProps {
    images: string[];
    isOpen: boolean;
    onClose: () => void;
    initialIndex?: number;
}

export function ImageLightbox({ images, isOpen, onClose, initialIndex = 0 }: ImageLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    // Reset index when initialIndex changes (new lightbox opened)
    useEffect(() => {
        setCurrentIndex(initialIndex);
    }, [initialIndex]);

    const nextImage = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    }, [images.length]);

    const prevImage = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    }, [images.length]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, nextImage, prevImage]);

    if (!isOpen || images.length === 0) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="fixed top-4 right-4 z-[110] w-12 h-12 flex items-center justify-center bg-black/60 rounded-full text-white/90 hover:text-white hover:bg-black/80 transition-colors border border-white/20">
                <X className="w-7 h-7" />
            </button>

            {images.length > 1 && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-50"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>
                </>
            )}

            <img
                src={images[currentIndex]}
                className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl rounded-md transition-opacity duration-300"
                onClick={(e) => e.stopPropagation()}
                key={currentIndex}
            />

            {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm font-mono tracking-widest bg-black/50 px-3 py-1 rounded-full backdrop-blur-md">
                    {currentIndex + 1} / {images.length}
                </div>
            )}
        </div>
    );
}
