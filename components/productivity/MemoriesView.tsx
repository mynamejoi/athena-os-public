'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Plus, Calendar as CalendarIcon, Loader2, X, Image as ImageIcon, RotateCw, Trash2, Pencil, Crop, LogIn, Layers } from 'lucide-react';
import { format, getYear, getMonth, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
    created_at: string;
    orientation?: 'landscape' | 'portrait';
    gallery?: GalleryItem[];
    type?: string;
}

interface UniformGridProps {
    gallery: any[];
    isMixed?: boolean;
    onImageClick?: (url: string) => void;
}

function Lightbox({ src, onClose }: { src: string, onClose: () => void }) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                <X className="w-8 h-8" />
            </button>
            <img src={src} className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl rounded-sm" onClick={(e) => e.stopPropagation()} />
        </div>
    );
}

function UniformGrid({ gallery, isMixed, onImageClick }: UniformGridProps) {
    const count = gallery.length;
    let gridClass = "grid h-full w-full gap-1.5 p-1.5";
    let getSpan = (index: number) => "col-span-1 row-span-1";

    // Helper for rendering static images - strictly handling click vs drag
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

        return (
            <div className="grid grid-cols-3 h-full w-full gap-1.5 p-1.5">
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

function MemoryCard({
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

    let aspectRatioClass = isPortrait ? "aspect-[3/5]" : "aspect-[16/9]";
    let colSpanClass = !isPortrait ? "md:col-span-2" : "col-span-1";

    if (isTrip && isMixed) {
        if (isLargeMixed) {
            aspectRatioClass = "aspect-[16/9]";
            colSpanClass = "md:col-span-2 lg:col-span-3";
        } else {
            aspectRatioClass = "aspect-[3/2]";
        }
    }

    return (
        <div className={cn("group relative w-full cursor-pointer break-inside-avoid", colSpanClass, aspectRatioClass)} onContextMenu={(e) => onContextMenu(e, memory)}>
            <div className="absolute inset-0 bg-[#0a0a0a] border border-athena-gold/40 shadow-2xl flex flex-col overflow-hidden hover:border-athena-gold/50 transition-colors duration-300">
                <div className="flex-1 w-full relative bg-zinc-950/50 overflow-hidden">
                    <UniformGrid gallery={gallery} isMixed={isMixed} onImageClick={onImageClick} />
                </div>
                <div className="pt-3 pb-3 px-2 flex flex-col justify-center items-center text-center shrink-0 border-t border-white/5 bg-[#0e0e0e]">
                    <h4 className="font-serif text-athena-gold-bright text-2xl leading-none font-bold tracking-wide text-shadow-sm mb-1 line-clamp-1">
                        {memory.title || 'Untitled'}
                    </h4>
                    <p className="text-[10px] text-athena-gold/60 font-mono uppercase tracking-[0.2em]">
                        {format(parseISO(memory.event_date), 'MMMM d, yyyy')}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function MemoriesView() {
    const supabase = createClient();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, memory: Memory } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [previewGallery, setPreviewGallery] = useState<{ url: string, orientation: 'landscape' | 'portrait', file?: File }[]>([]);
    const [title, setTitle] = useState('');
    const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [isDragging, setIsDragging] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useEffect(() => { fetchMemories(); }, []);

    const fetchMemories = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .or('type.eq.highlight,type.is.null') // Filter only highlights
            .order('event_date', { ascending: false });

        if (error) {
            console.error('Error fetching memories:', error);
            setMemories([]);
        } else {
            setMemories(data as Memory[] || []);
        }
        setLoading(false);
    };

    const updateMemory = async (updatedMemory: Memory) => {
        setMemories(prev => prev.map(m => m.id === updatedMemory.id ? updatedMemory : m));
        const { error } = await supabase.from('memories').update({ gallery: updatedMemory.gallery }).eq('id', updatedMemory.id);
        if (error) toast.error('Failed to save image position');
    };

    const handleContextMenu = (e: React.MouseEvent, memory: Memory) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, memory });
    };

    const handleEditClick = (memory: Memory) => {
        setEditingId(memory.id);
        setTitle(memory.title || '');
        setEventDate(memory.event_date);
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
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);
            const validFiles = files.filter(f => f.size <= 5 * 1024 * 1024);
            if (validFiles.length < files.length) toast.error('Some files were > 5MB and skipped');
            const newPreviews = [...previewGallery];
            validFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const src = ev.target?.result as string;
                    const img = new Image();
                    img.onload = () => {
                        const orientation = img.height > img.width ? 'portrait' : 'landscape';
                        setPreviewGallery(prev => [...prev, { url: src, orientation, file: file }]);
                    };
                    img.src = src;
                };
                reader.readAsDataURL(file);
            });
        }
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
            const payload = {
                user_id: user ? user.id : null,
                title,
                image_url: cover.url,
                orientation: cover.orientation,
                description: '',
                event_date: eventDate,
                gallery: finalGallery,
                type: 'highlight' // Explicitly mark as highlight
            };

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
    };

    const openAddDialog = () => { resetForm(); setIsDialogOpen(true); };

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

    return (
        <div className="h-full flex flex-col space-y-6 relative p-2">
            <div>
                <h1 className="text-4xl font-bold font-serif tracking-tight">Highlights</h1>
                <p className="text-muted-foreground mt-2">Life's Best Moments</p>
            </div>
            {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
            {contextMenu && (
                <div className="fixed z-50 bg-zinc-900 border border-athena-gold/20 rounded-lg shadow-xl w-48 py-1 overflow-hidden" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { handleEditClick(contextMenu.memory); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-athena-gold/10 hover:text-athena-gold flex items-center transition-colors">
                        <Pencil className="w-4 h-4 mr-2" /> Edit Memory
                    </button>
                    <button onClick={() => { handleDeleteClick(contextMenu.memory); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-500 flex items-center transition-colors">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                    </button>
                </div>
            )}
            <style jsx global>{`
                .text-shadow-sm { text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
                .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
            `}</style>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 pb-20">
                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="w-8 h-8 animate-spin text-athena-gold" />
                    </div>
                ) : memories.length === 0 ? (
                    <div className="text-center text-muted-foreground h-[60vh] flex flex-col items-center justify-center space-y-6">
                        <ImageIcon className="w-16 h-16 opacity-20 text-athena-gold" />
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-athena-gold">No Memories Yet</h3>
                            <p>Capture your best moments here.</p>
                        </div>
                        <Button onClick={openAddDialog} className="bg-athena-gold hover:bg-athena-gold-dim text-black font-semibold shadow-[0_0_15px_rgb(var(--athena-gold))] border-0">
                            <Plus className="w-4 h-4 mr-2" /> Add First Memory
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-12 pb-20">
                        {sortedYears.map(year => (
                            <div key={year} className="relative">
                                <div className="sticky top-0 z-10 flex items-center justify-between mb-4 pt-4">
                                    <h3 className="text-5xl font-black text-athena-gold/40 select-none drop-shadow-sm">
                                        {year}
                                    </h3>
                                    <Button onClick={openAddDialog} className="bg-athena-gold hover:bg-athena-gold-dim text-black font-semibold shadow-[0_0_15px_rgb(var(--athena-gold))] border-0">
                                        <Plus className="w-4 h-4 mr-2" /> Add Memory
                                    </Button>
                                </div>
                                <div className="mt-12 space-y-10 pl-2">
                                    {Object.keys(groupedMemories[year]).map(Number).sort((a, b) => b - a).map(month => (
                                        <div key={month} className="relative border-l border-athena-gold/20 pl-8 pb-4">
                                            <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-athena-gold ring-4 ring-black shadow-[0_0_10px_rgb(var(--athena-gold))]" />
                                            <h4 className="text-lg font-bold text-athena-gold/80 mb-6 uppercase tracking-widest pl-2">
                                                {format(new Date(year, month), 'MMMM')}
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pr-4 auto-rows-auto grid-flow-dense">
                                                {groupedMemories[year][month].map((memory, i) => (
                                                    <MemoryCard key={memory.id} memory={memory} onContextMenu={handleContextMenu} onImageClick={setLightboxUrl} onUpdateMemory={updateMemory} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-zinc-950 border-athena-gold/20 text-white sm:max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <DialogHeader>
                        <DialogTitle className="text-athena-gold">
                            {editingId ? 'Edit Memory' : 'Add New Memory'}
                        </DialogTitle>
                    </DialogHeader>
                    {/* ... (Dialog content remains same) ... */}
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            {previewGallery.map((item, idx) => (
                                <div key={item.url} draggable onDragStart={(e) => { setDraggedIndex(idx); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={(e) => { e.preventDefault(); if (draggedIndex === null) return; if (draggedIndex !== idx) { const newGallery = [...previewGallery]; const [removed] = newGallery.splice(draggedIndex, 1); newGallery.splice(idx, 0, removed); setPreviewGallery(newGallery); } setDraggedIndex(null); }} className={cn("relative group aspect-square rounded-lg overflow-hidden border border-white/10 cursor-move transition-all", draggedIndex === idx ? "opacity-50 scale-95" : "opacity-100")}>
                                    <img src={item.url} className="w-full h-full object-cover pointer-events-none" />
                                    <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-black/50 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 text-white z-10"><X className="w-3 h-3" /></button>
                                    {idx === 0 && (<div className="absolute bottom-1 left-1 bg-athena-gold text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm z-10 pointer-events-none">COVER</div>)}
                                </div>
                            ))}
                            <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }} onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { const files = Array.from(e.dataTransfer.files); const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024); if (validFiles.length < files.length) toast.error('Some files were skipped'); validFiles.forEach(file => { const reader = new FileReader(); reader.onload = (ev) => { const src = ev.target?.result as string; const img = new Image(); img.onload = () => { const orientation = img.height > img.width ? 'portrait' : 'landscape'; setPreviewGallery(prev => [...prev, { url: src, orientation, file: file }]); }; img.src = src; }; reader.readAsDataURL(file); }); } }} className={cn("border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all duration-300 aspect-square", isDragging ? "border-athena-gold bg-athena-gold/10 scale-105" : "border-white/10 hover:border-athena-gold/50 hover:bg-white/5")}>
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-1 transition-colors", isDragging ? "bg-athena-gold text-black" : "bg-athena-gold/10")}>
                                    <Plus className={cn("w-5 h-5", isDragging ? "text-black" : "text-athena-gold")} />
                                </div>
                                <p className={cn("text-xs transition-colors", isDragging ? "text-athena-gold" : "text-zinc-400")}>{isDragging ? 'Drop Photos Here' : 'Add or Drop Photos'}</p>
                            </div>
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-zinc-400">Title</Label>
                                <Input placeholder="e.g. Summer in Paris" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-zinc-900 border-white/10 focus:border-athena-gold/50" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-zinc-400">Date</Label>
                                <div className="relative">
                                    <CalendarIcon className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                                    <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="bg-zinc-900 border-white/10 pl-9 focus:border-athena-gold/50" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="hover:bg-white/5 hover:text-athena-gold">Cancel</Button>
                        <Button onClick={handleSave} disabled={previewGallery.length === 0 || !title || uploading} className="bg-athena-gold hover:bg-athena-gold-dim text-black font-semibold">
                            {uploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving... </>) : (editingId ? 'Update Memory' : 'Save Memory')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
