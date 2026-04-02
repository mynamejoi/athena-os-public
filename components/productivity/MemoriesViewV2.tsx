'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { format, getYear, getMonth, parseISO } from 'date-fns';
import {
    Plus, Calendar as CalendarIcon,
    Loader2, X, Image as ImageIcon, Pencil, Trash2, Plane, Tag, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AthenaNavBar } from './AthenaNavBar';
import { ImageLightbox } from './shared/ImageLightbox';
import { handleImageSelectFiles, processImageFiles, reorderGallery, PreviewGalleryItem } from './shared/useImageUpload';

// --- Interfaces ---
interface GalleryItem {
    url: string;
    orientation: 'landscape' | 'portrait';
    caption?: string;
    objectPosition?: string;
}

interface Memory {
    id: string;
    title?: string;
    image_url: string;
    description: string;
    event_date: string;
    end_date?: string;
    created_at: string;
    orientation?: 'landscape' | 'portrait';
    gallery?: GalleryItem[];
    type?: string;
    tags?: string[];
}

type MemoryType = 'highlight' | 'vacation';

const PRESET_TAGS = ['Milestone', 'Social', 'Fitness', 'Travel', 'Personal', 'Achievement', 'Family', 'Career'];

const TAG_COLORS: Record<string, string> = {
    Milestone: 'bg-athena-gold/20 text-athena-gold-bright',
    Social: 'bg-blue-500/20 text-blue-300',
    Fitness: 'bg-green-500/20 text-green-300',
    Travel: 'bg-cyan-500/20 text-cyan-300',
    Personal: 'bg-purple-500/20 text-purple-300',
    Achievement: 'bg-athena-gold/20 text-athena-gold-bright',
    Family: 'bg-rose-500/20 text-rose-300',
    Career: 'bg-indigo-500/20 text-indigo-300',
};

function getTagColor(tag: string) {
    return TAG_COLORS[tag] || 'bg-white/10 text-white/70';
}

interface UniformGridProps {
    gallery: any[];
    isMixed?: boolean;
    onImageClick?: (url: string) => void;
}

// --- Highlight Card Gallery Grid ---

function UniformGrid({ gallery, isMixed, onImageClick }: UniformGridProps) {
    const count = gallery.length;
    let gridClass = "grid h-full w-full gap-1.5 p-1.5";
    let getSpan = (index: number) => "col-span-1 row-span-1";

    const renderImage = (item: any, i: number) => (
        <div
            className="w-full h-full cursor-pointer relative overflow-hidden"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onImageClick?.(item.url);
            }}
        >
            <img
                src={item.url}
                className="w-full h-full object-cover hover:opacity-90 transition-opacity duration-200 pointer-events-none select-none"
                style={{ objectPosition: item.objectPosition || "50% 50%" }}
                loading="lazy"
                draggable={false}
            />
        </div>
    );

    if (count === 1) {
        return (
            <div className="w-full h-full p-1">
                <div className="w-full h-full relative overflow-hidden rounded-sm border border-white/10">
                    {renderImage(gallery[0], 0)}
                </div>
            </div>
        );
    }

    if (isMixed && count >= 3) {
        const verticals = gallery.map((item: any, i: number) => ({ ...item, originalIndex: i })).filter((i: any) => i.orientation === 'portrait');
        const horizontals = gallery.map((item: any, i: number) => ({ ...item, originalIndex: i })).filter((i: any) => i.orientation === 'landscape');
        const allOrdered = [...verticals, ...horizontals];

        return (
            <>
                {/* Mobile: simple 2x2 grid */}
                <div className="grid grid-cols-2 h-full w-full gap-1 p-1 md:hidden">
                    {allOrdered.slice(0, 4).map((item: any, i: number) => (
                        <div key={`m-${i}`} className="relative w-full h-full overflow-hidden rounded-sm border border-white/10 bg-zinc-900 shadow-inner">
                            {renderImage(item, item.originalIndex)}
                        </div>
                    ))}
                </div>
                {/* Desktop: portrait-heavy layout */}
                <div className="hidden md:grid grid-cols-3 h-full w-full gap-1.5 p-1.5">
                    <div className="col-span-2 grid grid-flow-col auto-cols-fr gap-1.5 h-full">
                        {verticals.map((item: any, i: number) => (
                            <div key={`v-${i}`} className="relative w-full h-full overflow-hidden rounded-sm border border-white/10 bg-zinc-900 shadow-inner">
                                {renderImage(item, item.originalIndex)}
                            </div>
                        ))}
                    </div>
                    <div className="col-span-1 flex flex-col gap-1.5 h-full">
                        {horizontals.map((item: any, i: number) => (
                            <div key={`h-${i}`} className="relative flex-1 w-full overflow-hidden rounded-sm border border-white/10 bg-zinc-900 shadow-inner">
                                {renderImage(item, item.originalIndex)}
                            </div>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    if (count === 2) gridClass += " grid-cols-2";
    else if (count === 3) gridClass += " grid-cols-3";
    else if (count === 4) isMixed ? (gridClass += " grid-cols-4") : (gridClass += " grid-cols-2 grid-rows-2");
    else if (count === 5) gridClass += " grid-cols-5";
    else gridClass += " grid-cols-3 grid-rows-2";

    const maxDisplay = 6;
    const displayItems = gallery.slice(0, maxDisplay);
    const hiddenCount = Math.max(0, count - maxDisplay);

    return (
        <div className={gridClass}>
            {displayItems.map((item, i) => (
                <div key={i} className={cn("relative w-full h-full overflow-hidden rounded-sm border border-white/10 bg-zinc-900 shadow-inner", getSpan(i))}>
                    {renderImage(item, i)}
                    {i === maxDisplay - 1 && hiddenCount > 0 && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
                            <span className="text-white font-bold text-lg">+{hiddenCount}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// --- Highlight-style Card ---

function HighlightCard({
    memory,
    onContextMenu,
    onImageClick,
    onUpdateMemory
}: {
    memory: Memory,
    onContextMenu: (e: React.MouseEvent, memory: Memory) => void,
    onImageClick?: (url: string) => void,
    onUpdateMemory?: (memory: Memory) => void
}) {
    const gallery = memory.gallery || [{ url: memory.image_url, orientation: memory.orientation || 'landscape' }];
    const isTrip = gallery.length > 1;
    const isPortrait = isTrip ? false : (memory.orientation === 'portrait');
    const hasPortrait = memory.gallery?.some(i => i.orientation === 'portrait');
    const hasLandscape = memory.gallery?.some(i => i.orientation === 'landscape');
    const isMixed = hasPortrait && hasLandscape;
    const itemCount = gallery.length;
    const isLargeMixed = isMixed && itemCount >= 3;

    let aspectRatioClass = isPortrait ? "aspect-[3/4] md:aspect-[3/5]" : "aspect-[4/3] md:aspect-[16/9]";
    let colSpanClass = !isPortrait ? "col-span-2 md:col-span-2" : "col-span-1";

    if (isTrip && isMixed) {
        if (isLargeMixed) {
            aspectRatioClass = "aspect-square md:aspect-[16/9]";
            colSpanClass = "col-span-2 md:col-span-2 lg:col-span-3";
        } else {
            aspectRatioClass = "aspect-[3/4] md:aspect-[3/2]";
        }
    }

    return (
        <div className={cn("group relative w-full cursor-pointer break-inside-avoid", colSpanClass, aspectRatioClass)} onContextMenu={(e) => onContextMenu(e, memory)}
            onTouchStart={(e) => {
                const timer = setTimeout(() => {
                    const touch = e.touches[0];
                    onContextMenu({ preventDefault: () => {}, clientX: touch.clientX, clientY: touch.clientY } as any, memory);
                }, 500);
                (e.currentTarget as any)._longPressTimer = timer;
            }}
            onTouchEnd={(e) => {
                clearTimeout((e.currentTarget as any)._longPressTimer);
            }}
            onTouchMove={(e) => {
                clearTimeout((e.currentTarget as any)._longPressTimer);
            }}
        >
            <div className="absolute inset-0 bg-athena-bg/40 border border-athena-border/50 shadow-2xl flex flex-col overflow-hidden hover:border-athena-gold/50 transition-colors duration-300 rounded-xl backdrop-blur-sm">
                <div className="flex-1 w-full relative bg-zinc-950/20 overflow-hidden">
                    <UniformGrid gallery={gallery} isMixed={isMixed} onImageClick={onImageClick} />
                </div>
                <div className="pt-3 pb-3 px-4 flex flex-col justify-center items-center text-center shrink-0 border-t border-athena-border/30 bg-athena-panel/60">
                    <h4 className="font-serif text-athena-text-primary text-xl leading-none font-bold tracking-wide mb-1 line-clamp-1">
                        {memory.title || 'Untitled'}
                    </h4>
                    <p className="text-[10px] text-athena-gold font-mono uppercase tracking-[0.2em] opacity-80">
                        {format(parseISO(memory.event_date), 'MMMM d, yyyy')}
                    </p>
                    {memory.tags && memory.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 justify-center">
                            {memory.tags.map(tag => (
                                <span key={tag} className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider", getTagColor(tag))}>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Vacation-style Gallery ---

function VacationGallery({ gallery, onImageClick }: { gallery: any[], onImageClick?: (index: number) => void }) {
    if (!gallery || gallery.length === 0) return null;

    return (
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
            {gallery.map((item, i) => (
                <div
                    key={i}
                    className="relative h-[160px] sm:h-[200px] md:h-[300px] md:flex-grow md:min-w-[150px] cursor-pointer overflow-hidden rounded-sm transition-opacity hover:opacity-90"
                    onClick={() => onImageClick?.(i)}
                >
                    <img
                        src={item.url}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                </div>
            ))}
            <div className="hidden md:block flex-grow-[10] h-0 bg-transparent pointer-events-none" style={{ minWidth: '30%' }}></div>
        </div>
    );
}

function formatDateRange(startStr: string, endStr?: string) {
    const start = parseISO(startStr);
    if (!endStr) return format(start, 'MMMM d, yyyy');

    const end = parseISO(endStr);

    if (getYear(start) !== getYear(end)) {
        return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
    }

    if (getMonth(start) !== getMonth(end)) {
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }

    return `${format(start, 'MMM d')} - ${format(end, 'd, yyyy')}`;
}

// --- Vacation-style Card ---

function VacationCard({
    memory,
    onContextMenu,
    onImageClick,
    onUpdateMemory
}: {
    memory: Memory,
    onContextMenu: (e: React.MouseEvent, memory: Memory) => void,
    onImageClick?: (gallery: string[], index: number) => void,
    onUpdateMemory?: (memory: Memory) => void
}) {
    const gallery = memory.gallery || [{ url: memory.image_url, orientation: memory.orientation || 'landscape' }];
    const imageUrls = gallery.map(g => g.url);

    return (
        <div className="group relative w-full mb-24" onContextMenu={(e) => onContextMenu(e, memory)}
            onTouchStart={(e) => {
                const timer = setTimeout(() => {
                    const touch = e.touches[0];
                    onContextMenu({ preventDefault: () => {}, clientX: touch.clientX, clientY: touch.clientY } as any, memory);
                }, 500);
                (e.currentTarget as any)._longPressTimer = timer;
            }}
            onTouchEnd={(e) => {
                clearTimeout((e.currentTarget as any)._longPressTimer);
            }}
            onTouchMove={(e) => {
                clearTimeout((e.currentTarget as any)._longPressTimer);
            }}
        >
            {/* Title Section */}
            <div className="mb-8 flex flex-col items-start px-1">
                <h2 className="text-xl md:text-3xl lg:text-4xl font-black text-athena-gold font-serif leading-none tracking-tight mb-3 drop-shadow-lg">
                    {memory.title || 'Unknown Location'}
                </h2>
                <div className="flex items-center gap-3">
                    <div className="h-[2px] w-12 bg-athena-gold/40"></div>
                    <p className="text-sm text-athena-gold/80 font-serif uppercase tracking-[0.3em] font-bold">
                        {formatDateRange(memory.event_date, memory.end_date)}
                    </p>
                </div>
                {memory.tags && memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {memory.tags.map(tag => (
                            <span key={tag} className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider", getTagColor(tag))}>
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Gallery Section */}
            <div className="w-full">
                <VacationGallery gallery={gallery} onImageClick={(index) => onImageClick?.(imageUrls, index)} />
            </div>
        </div>
    );
}

// --- Main Component ---

export default function MemoriesViewV2() {
    const router = useRouter();
    const supabase = createClient();
    const [now, setNow] = useState(new Date());
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);

    // Dialog State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, memory: Memory } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lightboxState, setLightboxState] = useState<{ images: string[], index: number } | null>(null);
    const [previewGallery, setPreviewGallery] = useState<PreviewGalleryItem[]>([]);
    const [title, setTitle] = useState('');
    const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [tags, setTags] = useState<string[]>([]);
    const [customTagInput, setCustomTagInput] = useState('');
    const [dialogMemoryType, setDialogMemoryType] = useState<MemoryType>('highlight');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- Clock Effect ---
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // --- Data Fetching ---
    useEffect(() => { fetchMemories(); }, []);

    const fetchMemories = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .order('event_date', { ascending: false });

        if (error) {
            console.error('Error fetching memories:', error);
            setMemories([]);
        } else {
            setMemories(data as Memory[] || []);
        }
        setLoading(false);
    };

    // --- Actions ---
    const updateMemory = async (updatedMemory: Memory) => {
        setMemories(prev => prev.map(m => m.id === updatedMemory.id ? updatedMemory : m));
        const { error } = await supabase.from('memories').update({ gallery: updatedMemory.gallery }).eq('id', updatedMemory.id);
        if (error) toast.error('Failed to save image position');
    };

    const handleContextMenu = (e: React.MouseEvent, memory: Memory) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, memory });
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleEditClick = (memory: Memory) => {
        setEditingId(memory.id);
        setTitle(memory.title || '');
        setEventDate(memory.event_date);
        setEndDate(memory.end_date || '');
        setTags(memory.tags || []);
        setDialogMemoryType(memory.type === 'vacation' ? 'vacation' : 'highlight');
        const gallery: GalleryItem[] = memory.gallery || [{ url: memory.image_url, orientation: memory.orientation || 'landscape' }];
        setPreviewGallery(gallery);
        setIsDialogOpen(true);
    };

    const handleDeleteClick = async (memory: Memory) => {
        if (!confirm('Are you sure you want to delete this memory?')) return;
        try {
            const { error } = await supabase.from('memories').delete().eq('id', memory.id);
            if (error) throw error;
            toast.success('Memory deleted');
            fetchMemories();
        } catch (error) {
            console.error(error);
            toast.error('Failed to delete');
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleImageSelectFiles(e, (item) => setPreviewGallery(prev => [...prev, item]));
    };

    const removeImage = (index: number) => {
        setPreviewGallery(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (previewGallery.length === 0 || !title) return;
        setUploading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || 'anon';
            const finalGallery: GalleryItem[] = [];

            for (const item of previewGallery) {
                if (item.file) {
                    const fileExt = item.file.name.split('.').pop();
                    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                    const { error: uploadError } = await supabase.storage.from('memories').upload(fileName, item.file);
                    if (uploadError) throw uploadError;
                    const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);
                    finalGallery.push({ url: publicUrl, orientation: item.orientation });
                } else {
                    finalGallery.push({ url: item.url, orientation: item.orientation });
                }
            }

            const cover = finalGallery[0];
            const payload: Record<string, any> = {
                user_id: user ? user.id : null,
                title,
                image_url: cover.url,
                orientation: cover.orientation,
                description: '',
                event_date: eventDate,
                gallery: finalGallery,
                type: dialogMemoryType,
                tags
            };

            if (dialogMemoryType === 'vacation') {
                payload.end_date = endDate || null;
            } else {
                payload.end_date = null;
            }

            if (editingId) {
                const { error } = await supabase.from('memories').update(payload).eq('id', editingId);
                if (error) throw error;
                toast.success('Memory updated');
            } else {
                const { error } = await supabase.from('memories').insert(payload);
                if (error) throw error;
                toast.success('Memory created');
            }
            setIsDialogOpen(false);
            resetForm();
            fetchMemories();
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Operation failed');
        } finally {
            setUploading(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setPreviewGallery([]);
        setTitle('');
        setEventDate(format(new Date(), 'yyyy-MM-dd'));
        setEndDate('');
        setTags([]);
        setCustomTagInput('');
        setDialogMemoryType('highlight');
    };

    const toggleTag = (tag: string) => {
        setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const addCustomTag = () => {
        const trimmed = customTagInput.trim();
        if (trimmed && !tags.includes(trimmed)) {
            setTags(prev => [...prev, trimmed]);
        }
        setCustomTagInput('');
    };

    const openAddDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const handleDialogTypeChange = (newType: MemoryType) => {
        setDialogMemoryType(newType);
        if (newType === 'vacation') {
            if (!tags.includes('Travel')) {
                setTags(prev => [...prev, 'Travel']);
            }
        }
    };

    const openLightbox = (imagesOrUrl: string | string[], index?: number) => {
        if (typeof imagesOrUrl === 'string') {
            setLightboxState({ images: [imagesOrUrl], index: 0 });
        } else {
            setLightboxState({ images: imagesOrUrl, index: index || 0 });
        }
    };

    // Grouping Logic
    const groupedMemories = memories.reduce((acc, memory) => {
        const date = parseISO(memory.event_date);
        const year = getYear(date);
        const month = getMonth(date);
        if (!acc[year]) acc[year] = {};
        if (!acc[year][month]) acc[year][month] = [];
        acc[year][month].push(memory);
        return acc;
    }, {} as Record<number, Record<number, Memory[]>>);

    const sortedYears = Object.keys(groupedMemories).map(Number).sort((a, b) => b - a);

    const isVacation = (memory: Memory) => memory.type === 'vacation';

    const openAddHighlight = () => {
        resetForm();
        setDialogMemoryType('highlight');
        setTags([]);
        setIsDialogOpen(true);
    };

    const openAddVacation = () => {
        resetForm();
        setDialogMemoryType('vacation');
        setTags(['Travel']);
        setIsDialogOpen(true);
    };

    return (
        <div className="min-h-screen bg-athena-bg text-athena-text-primary font-manrope selection:bg-athena-gold-dim/30 pb-20">
            {/* Ambient Background */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <div className="absolute top-0 right-1/4 w-[600px] h-[500px] bg-athena-gold/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] bg-purple-900/10 rounded-full blur-[100px]" />
            </div>

            {/* Sticky Nav */}
            <AthenaNavBar activeTab="memories" />

            {/* Main Content */}
            <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 lg:px-16 py-2 md:py-8 space-y-6 font-sans">
                <ImageLightbox
                    images={lightboxState?.images || []}
                    isOpen={!!lightboxState}
                    onClose={() => setLightboxState(null)}
                    initialIndex={lightboxState?.index || 0}
                />

                {contextMenu && (
                    <div className="fixed z-50 bg-athena-bg border border-athena-border rounded-lg shadow-xl w-48 py-1 overflow-hidden backdrop-blur-md" style={{ top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 200), left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 160) }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { handleEditClick(contextMenu.memory); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-athena-text-primary hover:bg-athena-gold/10 hover:text-athena-gold flex items-center transition-colors">
                            <Pencil className="w-4 h-4 mr-2" /> Edit Memory
                        </button>
                        <button onClick={() => { handleDeleteClick(contextMenu.memory); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-athena-red hover:bg-athena-red/10 flex items-center transition-colors">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </button>
                    </div>
                )}


                <div className="flex-1 min-h-[600px]">
                    {loading ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="w-8 h-8 animate-spin text-athena-gold" />
                        </div>
                    ) : memories.length === 0 ? (
                        <div className="text-center text-athena-text-muted h-[60vh] flex flex-col items-center justify-center space-y-6">
                            <ImageIcon className="w-16 h-16 opacity-20 text-athena-gold" />
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-athena-gold">No Memories Yet</h3>
                                <p>Capture your best moments here.</p>
                            </div>
                            <div className="flex gap-3">
                                <Button onClick={openAddHighlight} className="bg-athena-gold hover:bg-athena-gold-bright text-black font-serif font-bold shadow-[0_0_15px_rgb(var(--athena-gold))] border-0 tracking-wide">
                                    <Sparkles className="w-4 h-4 mr-2" /> Add Highlight
                                </Button>
                                <Button onClick={openAddVacation} variant="outline" className="border-athena-gold/30 text-athena-gold hover:bg-athena-gold/10 font-serif font-bold tracking-wide">
                                    <Plane className="w-4 h-4 mr-2" /> Add Vacation
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-16 pb-20">
                            {sortedYears.map((year, index) => (
                                <div key={year} className="relative">
                                    {index === 0 && (
                                        <div className="hidden md:block text-[10px] text-athena-text-muted uppercase tracking-[0.3em] font-semibold mb-2 font-sans">Memories</div>
                                    )}
                                    <div className="sticky top-16 z-10 flex items-end justify-between mb-8 pb-4 pt-0 backdrop-blur-sm">
                                        <div>
                                            <h3 className="text-3xl md:text-4xl lg:text-5xl font-serif text-athena-text-primary">
                                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-athena-gold to-athena-gold-pale">
                                                    {year}
                                                </span>
                                            </h3>
                                        </div>
                                        {index === 0 && (
                                            <div className="flex gap-2">
                                                <Button onClick={openAddHighlight} size="sm" className="bg-athena-gold hover:bg-athena-gold-bright text-black font-sans font-semibold border-0 rounded-full px-4 text-xs">
                                                    <Sparkles className="w-3 h-3 mr-1" /> Highlight
                                                </Button>
                                                <Button onClick={openAddVacation} size="sm" variant="outline" className="border-athena-gold/30 text-athena-gold hover:bg-athena-gold/10 font-sans font-semibold rounded-full px-4 text-xs">
                                                    <Plane className="w-3 h-3 mr-1" /> Vacation
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-12 pl-2">
                                        {Object.keys(groupedMemories[year]).map(Number).sort((a, b) => b - a).map(month => {
                                            const monthMemories = groupedMemories[year][month];
                                            // Separate vacations and highlights for rendering
                                            const hasVacations = monthMemories.some(m => isVacation(m));
                                            const hasHighlights = monthMemories.some(m => !isVacation(m));

                                            return (
                                                <div key={month} className="relative border-l border-athena-border/50 pl-4 md:pl-8 pb-4">
                                                    <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-athena-gold ring-4 ring-athena-bg shadow-[0_0_10px_rgb(var(--athena-gold))]" />
                                                    <h4 className="text-lg font-bold text-athena-gold mb-6 uppercase tracking-widest pl-2 font-serif">
                                                        {format(new Date(year, month), 'MMMM')}
                                                    </h4>

                                                    {/* Render vacations full-width */}
                                                    {monthMemories.filter(m => isVacation(m)).map(memory => (
                                                        <VacationCard
                                                            key={memory.id}
                                                            memory={memory}
                                                            onContextMenu={handleContextMenu}
                                                            onImageClick={(imgs, idx) => openLightbox(imgs, idx)}
                                                            onUpdateMemory={updateMemory}
                                                        />
                                                    ))}

                                                    {/* Render highlights in grid */}
                                                    {hasHighlights && (
                                                        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-8 pr-0 md:pr-4 auto-rows-auto grid-flow-dense">
                                                            {monthMemories.filter(m => !isVacation(m)).map(memory => (
                                                                <HighlightCard
                                                                    key={memory.id}
                                                                    memory={memory}
                                                                    onContextMenu={handleContextMenu}
                                                                    onImageClick={(url) => openLightbox(url)}
                                                                    onUpdateMemory={updateMemory}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-athena-panel border-athena-border text-athena-text-primary w-[90vw] max-w-lg rounded-xl max-h-[90vh] overflow-y-auto custom-scrollbar backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="text-athena-gold font-serif text-2xl">
                            {editingId ? 'Edit Memory' : dialogMemoryType === 'vacation' ? 'Add Vacation' : 'Add Highlight'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {/* Gallery Preview */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {previewGallery.map((item, idx) => (
                                <div key={item.url} draggable onDragStart={(e) => { setDraggedIndex(idx); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={(e) => { e.preventDefault(); if (draggedIndex === null) return; if (draggedIndex !== idx) { setPreviewGallery(prev => reorderGallery(prev, draggedIndex, idx)); } setDraggedIndex(null); }} className={cn("relative group aspect-square rounded-lg overflow-hidden border border-athena-border/50 cursor-move transition-all", draggedIndex === idx ? "opacity-50 scale-95" : "opacity-100")}>
                                    <img src={item.url} className="w-full h-full object-cover pointer-events-none" />
                                    <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 text-white z-10"><X className="w-3 h-3" /></button>
                                    {idx === 0 && (<div className="absolute bottom-1 left-1 bg-athena-gold text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm z-10 pointer-events-none">COVER</div>)}
                                </div>
                            ))}
                            <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { processImageFiles(Array.from(e.dataTransfer.files), (item) => setPreviewGallery(prev => [...prev, item])); } }} className={cn("border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-300 aspect-square", isDragging ? "border-athena-gold bg-athena-gold/10 scale-105" : "border-athena-border/30 hover:border-athena-gold/50 hover:bg-athena-bg/20")}>
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-1 transition-colors", isDragging ? "bg-athena-gold text-black" : "bg-athena-gold/10")}>
                                    <Plus className={cn("w-5 h-5", isDragging ? "text-black" : "text-athena-gold")} />
                                </div>
                                <p className={cn("text-xs transition-colors", isDragging ? "text-athena-gold" : "text-athena-text-muted")}>{isDragging ? 'Drop Photos Here' : 'Add or Drop Photos'}</p>
                            </div>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-athena-text-muted">{dialogMemoryType === 'vacation' ? 'Location / Title' : 'Title'}</Label>
                                <Input placeholder={dialogMemoryType === 'vacation' ? 'e.g. Kyoto, Japan' : 'e.g. Summer in Paris'} value={title} onChange={(e) => setTitle(e.target.value)} className="bg-athena-bg/50 border-athena-border focus:border-athena-gold/50" />
                            </div>

                            {/* Date fields - conditional */}
                            {dialogMemoryType === 'vacation' ? (
                                <div className="space-y-1">
                                    <Label className="text-athena-text-muted">Date Range (Start - End)</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-athena-text-muted" />
                                            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="bg-athena-bg/50 border-athena-border pl-9 focus:border-athena-gold/50 text-white fill-white" style={{ colorScheme: 'dark' }} />
                                        </div>
                                        <div className="relative flex-1">
                                            <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-athena-text-muted" />
                                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End Date" className="bg-athena-bg/50 border-athena-border pl-9 focus:border-athena-gold/50 text-white fill-white" style={{ colorScheme: 'dark' }} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <Label className="text-athena-text-muted">Date</Label>
                                    <div className="relative">
                                        <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-athena-text-muted" />
                                        <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="bg-athena-bg/50 border-athena-border pl-9 focus:border-athena-gold/50 text-white fill-white" style={{ colorScheme: 'dark' }} />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-athena-text-muted flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Tags</Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PRESET_TAGS.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={cn(
                                                "text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-200 border",
                                                tags.includes(tag)
                                                    ? "border-athena-gold/70 shadow-[0_0_6px_rgb(var(--athena-gold))] " + getTagColor(tag)
                                                    : "border-white/10 bg-white/5 text-white/40 hover:border-white/20 hover:text-white/60"
                                            )}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                                {tags.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tags.filter(t => !PRESET_TAGS.includes(t)).map(tag => (
                                            <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full border border-athena-gold/70 bg-white/10 text-white/70 shadow-[0_0_6px_rgb(var(--athena-gold))] flex items-center gap-1">
                                                {tag}
                                                <button type="button" onClick={() => toggleTag(tag)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Custom tag..."
                                        value={customTagInput}
                                        onChange={(e) => setCustomTagInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
                                        className="bg-athena-bg/50 border-athena-border focus:border-athena-gold/50 text-sm h-8"
                                    />
                                    <Button type="button" variant="ghost" size="sm" onClick={addCustomTag} disabled={!customTagInput.trim()} className="h-8 px-3 text-athena-gold hover:bg-athena-gold/10">Add</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="hover:bg-athena-bg/20 hover:text-athena-gold">Cancel</Button>
                        <Button onClick={handleSave} disabled={previewGallery.length === 0 || !title || uploading} className="bg-athena-gold hover:bg-athena-gold-bright text-black font-semibold">
                            {uploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving... </>) : (editingId ? 'Update Memory' : 'Save Memory')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
