'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, differenceInDays, addDays } from 'date-fns';
import { Card } from '@/components/ui/card';
import { BookOpen, Check, Library, ChevronRight, BookMarked, Plus, Trash2, MoreVertical } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { SINGLE_USER_ID } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

// Reusable GlowRing Component
function GlowRing({ pct, size = 44, strokeWidth = 3, color = 'text-athena-gold', children }: {
    pct: number; size?: number; strokeWidth?: number; color?: string; children?: React.ReactNode;
}) {
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg className="w-full h-full transform -rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-white/5" />
                <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
                    strokeDasharray={circ} strokeDashoffset={circ - circ * pct} strokeLinecap="round" className={color} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        </div>
    );
}

// Reusable BookSpine Component
function BookSpine({ book, size = 'sm' }: { book: any, size?: 'sm' | 'md' | 'lg' | 'xl' }) {
    const dims = {
        sm: 'w-10 h-14 text-[10px]',
        md: 'w-16 h-[88px] text-[10px]',
        lg: 'w-24 h-[132px] text-[10px]',
        xl: 'w-32 h-[176px] text-[12px]'
    }[size];

    return (
        <div className={`relative ${dims} rounded-[2px] shadow-lg shrink-0 flex items-center justify-center`} style={{ background: book.gradient }}>
            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent rounded-[2px]" />
            <div className="absolute left-1 top-0 bottom-0 w-[2px] bg-black/20" />
            <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-white/20" />
            <span className="font-serif font-bold text-white/90 leading-tight text-center px-1" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>
                {book.title}
            </span>
        </div>
    );
}

function getDeterministicColor(title: string) {
    if (!title) return 'linear-gradient(135deg, #2a2a2a, #111111)';
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
        hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    // Use lower saturation (25-35%) and darker lightness (20-35%) for a more neutral, premium book look
    return `linear-gradient(135deg, hsl(${h}, 30%, 30%), hsl(${(h + 20) % 360}, 35%, 15%))`;
}

const LIGHT_COVERS = ['#f8fafc', '#e9d5db', '#d4e2d4', '#d8d0e5', '#fefbfc', '#d6d3d1'];
const isLightColor = (gradient: string | null | undefined) => {
    if (!gradient) return false;
    return LIGHT_COVERS.some(c => gradient.includes(c));
};

function MobileBookCard({ book, pct, onEdit, onAction }: { book: any; pct?: number; onEdit: (b: any) => void; onAction: (book: any, action: string) => void }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const displayPct = pct ?? (book.pages > 0 ? Math.round(((book.current || 0) / book.pages) * 100) : 0);

    return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-athena-border/30 bg-white/[0.02] min-h-[44px] relative">
            {/* Color stripe */}
            <div className="w-[4px] self-stretch rounded-full shrink-0" style={{ background: book.gradient }} />
            {/* Info */}
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(book)}>
                <div className="text-[13px] font-semibold truncate leading-tight">{book.title}</div>
                <div className="text-[11px] text-athena-text-muted/60 truncate">{book.author}</div>
                {displayPct > 0 && displayPct < 100 && (
                    <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-[3px] bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${displayPct}%`, background: book.gradient }} />
                        </div>
                        <span className="text-[10px] text-athena-text-muted">{displayPct}%</span>
                    </div>
                )}
                {displayPct >= 100 && (
                    <div className="flex items-center gap-1 mt-1">
                        <Check size={10} className="text-emerald-400" />
                        <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Finished</span>
                    </div>
                )}
            </div>
            {/* Three-dot menu */}
            <div className="relative shrink-0">
                <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-athena-text-muted">
                    <MoreVertical size={16} />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-athena-panel border border-athena-border rounded-lg shadow-xl py-1 min-w-[160px]">
                        <button className="w-full text-left px-3 py-2 text-[12px] text-athena-text-primary hover:bg-white/5 min-h-[40px]" onClick={() => { onAction(book, 'active'); setMenuOpen(false); }}>Make Active</button>
                        <button className="w-full text-left px-3 py-2 text-[12px] text-athena-text-primary hover:bg-white/5 min-h-[40px]" onClick={() => { onAction(book, 'queue'); setMenuOpen(false); }}>Move to Queue</button>
                        <button className="w-full text-left px-3 py-2 text-[12px] text-athena-text-primary hover:bg-white/5 min-h-[40px]" onClick={() => { onAction(book, 'finish'); setMenuOpen(false); }}>Mark Finished</button>
                        <button className="w-full text-left px-3 py-2 text-[12px] text-athena-text-primary hover:bg-white/5 min-h-[40px]" onClick={() => { onEdit(book); setMenuOpen(false); }}>Edit</button>
                    </div>
                )}
            </div>
        </div>
    );
}

export function DevelopmentLibraryWorkspace() {
    const supabase = createClient();
    const [books, setBooks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [editBook, setEditBook] = useState<any | null>(null);
    const [quickUpdateOpen, setQuickUpdateOpen] = useState(false);
    const [quickUpdatePage, setQuickUpdatePage] = useState('');
    const [mobileUpdateOpen, setMobileUpdateOpen] = useState(false);
    const [mobileUpdatePage, setMobileUpdatePage] = useState('');
    const isMobile = useIsMobile();

    useEffect(() => {
        fetchBooks();
    }, []);

    async function fetchBooks() {
        setLoading(true);
        const { data, error } = await supabase.from('books').select('*').order('name');
        if (error) {
            toast.error('Failed to load books');
            console.error(error);
        } else {
            // Map the Supabase data to include missing UI properties
            const mappedBooks = (data || []).map(b => {
                const titleStr = b.name || b.title || 'Unknown Title';
                return {
                    ...b,
                    title: titleStr,
                    pages: b.total_pages,
                    current: b.current_page,
                    gradient: b.color || getDeterministicColor(titleStr)
                };
            });

            // Sort: Active first, then queue, then done
            mappedBooks.sort((a, b) => {
                if (a.is_active && !b.is_active) return -1;
                if (!a.is_active && b.is_active) return 1;
                if (a.status === 'Done' && b.status !== 'Done') return 1;
                if (a.status !== 'Done' && b.status === 'Done') return -1;
                return 0;
            });
            setBooks(mappedBooks);
        }
        setLoading(false);
    }

    const active = books.find(b => b.is_active);
    const pct = active && active.pages > 0 ? Math.round((active.current / active.pages) * 100) : 0;

    // Reading velocity for active book
    const activeVelocity = useMemo(() => {
        if (!active || !active.pages || active.current <= 0) return null;
        const startDate = active.created_at ? new Date(active.created_at) : null;
        if (!startDate) return null;
        const today = new Date();
        const daysSinceAdded = Math.max(differenceInDays(today, startDate), 1);
        const pagesPerDay = active.current / daysSinceAdded;
        const remainingPages = active.pages - active.current;
        if (remainingPages <= 0 || pagesPerDay <= 0) return null;
        const daysLeft = Math.ceil(remainingPages / pagesPerDay);
        const projectedFinish = addDays(today, daysLeft);
        return { pagesPerDay: Math.round(pagesPerDay * 10) / 10, daysLeft, projectedFinish };
    }, [active]);

    // Split inactive books
    const inactiveBooks = books.filter(b => !b.is_active);

    // Queue = Explicitly marked as Queue via year_finished
    const nextUp = inactiveBooks.filter(b => b.year_finished === 'Queue');

    // Finished Books = Done books finished this year
    const currentYear = new Date().getFullYear().toString();
    const doneBooksYear = books.filter(b => b.status === 'Done' && b.year_finished === currentYear);

    // Archive shelves
    // We exclude Queue books explicitly since they have status = 'Not started' but shouldn't be in Archive New
    const archiveBooks = inactiveBooks.filter(b => b.year_finished !== 'Queue');
    const archiveInProgress = archiveBooks.filter(b => b.status === 'In Progress' || b.status === 'Paused');
    const archiveFinished = archiveBooks.filter(b => b.status === 'Done');
    // New gets everything else (Not started, null, random strings) so we don't drop books
    const archiveNew = archiveBooks.filter(b => b.status !== 'In Progress' && b.status !== 'Paused' && b.status !== 'Done');

    // Stats
    const allDoneBooks = books.filter(b => b.status === 'Done');
    const totalRead = allDoneBooks.length;

    const handleDragStart = (e: React.DragEvent, book: any) => {
        e.dataTransfer.setData('bookId', book.id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetZone: 'Active' | 'Queue' | 'Archive') => {
        e.preventDefault();
        const bookId = e.dataTransfer.getData('bookId');
        if (!bookId) return;

        const book = books.find(b => b.id === bookId);
        if (!book) return;

        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || TEST_USER_ID;

        // Determine intended state based on target zone drop
        let is_active = false;
        let pStatus = book.status;
        let pYearFinished = book.year_finished;

        if (targetZone === 'Active') {
            is_active = true;
            if (pYearFinished === 'Queue') pYearFinished = 'In progress';
            await supabase.from('books').update({ is_active: false }).eq('user_id', userId);
        } else if (targetZone === 'Queue') {
            if (nextUp.length >= 3) {
                toast.error('Queue is full (max 3 books)');
                setLoading(false);
                return;
            }
            pStatus = 'Not started';
            pYearFinished = 'Queue';
        } else if (targetZone === 'Archive') {
            const current = book.current || book.current_page || 0;
            const total = book.pages || book.total_pages || Math.max(current, 1);
            if (total > 0 && current >= total) {
                pStatus = 'Done';
                pYearFinished = (pYearFinished === 'Queue' || pYearFinished === 'In progress' || !pYearFinished) ? new Date().getFullYear().toString() : pYearFinished;
            } else if (current > 0) {
                pStatus = 'In Progress';
                pYearFinished = 'In progress';
            } else {
                pStatus = 'Not started';
                if (pYearFinished === 'Queue') pYearFinished = null;
            }
        }

        const { error } = await supabase.from('books').update({
            is_active,
            status: pStatus,
            year_finished: pYearFinished
        }).eq('id', bookId);

        if (error) {
            toast.error('Failed to move book');
            console.error(error);
        } else {
            toast.success(`Book moved to ${targetZone}`);
            fetchBooks();
        }
        setLoading(false);
    };

    const handleMobileBookAction = async (book: any, action: string) => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || SINGLE_USER_ID;

        if (action === 'active') {
            await supabase.from('books').update({ is_active: false }).eq('user_id', userId);
            const { error } = await supabase.from('books').update({ is_active: true }).eq('id', book.id);
            if (error) toast.error('Failed'); else { toast.success('Book set to active'); fetchBooks(); }
        } else if (action === 'queue') {
            if (nextUp.length >= 3) { toast.error('Queue is full (max 3)'); setLoading(false); return; }
            const { error } = await supabase.from('books').update({ status: 'Not started', year_finished: 'Queue' }).eq('id', book.id);
            if (error) toast.error('Failed'); else { toast.success('Moved to queue'); fetchBooks(); }
        } else if (action === 'finish') {
            const { error } = await supabase.from('books').update({ status: 'Done', year_finished: new Date().getFullYear().toString() }).eq('id', book.id);
            if (error) toast.error('Failed'); else { toast.success('Marked finished'); fetchBooks(); }
        }
        setLoading(false);
    };

    if (books.length === 0 && !loading) {
        return (
            <div data-onboarding="library-workspace" className="text-center h-[60vh] flex flex-col items-center justify-center space-y-6 text-athena-text-muted">
                <BookOpen className="w-16 h-16 opacity-20 text-athena-gold" />
                <div className="space-y-2">
                    <h3 className="text-xl font-bold text-athena-gold">Start Your Library</h3>
                    <p className="text-sm max-w-xs mx-auto">Track what you are reading, set reading goals, and measure your reading pace.</p>
                </div>
                <button
                    onClick={() => setAddDialogOpen(true)}
                    className="px-5 py-2.5 min-h-[44px] bg-athena-gold hover:bg-athena-gold-bright text-black font-serif font-bold rounded-lg shadow-[0_0_15px_rgb(var(--athena-gold)/0.3)] transition-colors text-sm"
                >
                    Add Your First Book
                </button>
                {addDialogOpen && <AddBookDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onSuccess={fetchBooks} />}
            </div>
        );
    }

    return (
        <div data-onboarding="library-workspace" className="space-y-4 pb-20 md:pb-0">
            {/* Row 1: Active Reading | Overall Stats | Queue */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 md:min-h-[240px]">
                {/* 1. Active Reading */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                    <Card
                        className="bg-athena-panel/60 border-athena-gold/20 backdrop-blur-sm h-full flex flex-col p-3 md:p-5"
                        style={{ boxShadow: 'inset 0 0 20px rgb(var(--athena-gold-dim) / 0.1), 0 0 10px rgb(var(--athena-gold-dim) / 0.15)' }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'Active')}
                    >
                        <div className="flex items-center gap-2 mb-3 md:mb-4">
                            <BookOpen className="text-athena-gold" size={12} />
                            <div className="text-[10px] text-athena-gold uppercase tracking-[0.2em] font-bold">Active Reading</div>
                        </div>

                        {active ? (
                            <>
                                {/* Mobile: horizontal layout */}
                                <div className="flex md:hidden gap-4 items-start cursor-pointer" onClick={() => setEditBook(active)}>
                                    <div
                                        className="w-[70px] h-[100px] rounded-r-[6px] rounded-l-[3px] shadow-2xl flex flex-col justify-between p-2 relative overflow-hidden shrink-0"
                                        style={{ background: active.gradient }}
                                    >
                                        <div className="absolute left-0 top-0 bottom-0 w-[5px] bg-black/20" />
                                        <div className="absolute left-[4px] top-0 bottom-0 w-[1px] bg-white/20" />
                                        <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />
                                        <div className={`text-[10px] font-serif font-bold ${isLightColor(active.gradient) ? 'text-athena-bg' : 'text-white/95'} leading-tight z-10 break-words drop-shadow-md`}>
                                            {active.title}
                                        </div>
                                        <div className={`text-[10px] ${isLightColor(active.gradient) ? 'text-athena-bg/80' : 'text-white/70'} font-medium z-10 drop-shadow-sm uppercase tracking-wider`}>
                                            {active.author || ''}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-serif font-bold text-athena-text-primary mb-0.5 truncate">{active.title}</div>
                                        <div className="text-[11px] text-athena-text-muted mb-3">{active.author}</div>
                                        <div className="flex justify-between items-end mb-1.5">
                                            <div className="text-[12px] font-medium">p.{active.current} <span className="text-athena-text-muted/50 text-[10px]">/ {active.pages}</span></div>
                                            <div className="text-[12px] font-serif font-bold" style={{ color: active.gradient?.match(/#[0-9a-fA-F]{6}/)?.[0] || 'rgb(var(--athena-gold))' }}>{pct}%</div>
                                        </div>
                                        <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: active.gradient }} />
                                        </div>
                                        {activeVelocity && (
                                            <div className="text-[10px] text-athena-text-muted mt-1.5">
                                                ~{activeVelocity.daysLeft} days left &middot; Finish by {format(activeVelocity.projectedFinish, 'MMM d')}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Desktop: centered vertical layout */}
                                <div className="hidden md:flex flex-col flex-1 h-full items-center justify-center p-4">
                                    <div
                                        className="flex flex-col items-center justify-center mb-3 cursor-pointer group w-full"
                                        onClick={() => setEditBook(active)}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, active)}
                                    >
                                        <div
                                            className="w-[100px] h-[140px] rounded-r-[6px] rounded-l-[3px] shadow-2xl transition-transform group-hover:scale-105 flex flex-col justify-between p-3 relative overflow-hidden"
                                            style={{ background: active.gradient }}
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-[6px] bg-black/20" />
                                            <div className="absolute left-[5px] top-0 bottom-0 w-[1px] bg-white/20" />
                                            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />
                                            <div className={`text-[13px] font-serif font-bold ${isLightColor(active.gradient) ? 'text-athena-bg' : 'text-white/95'} leading-tight z-10 break-words drop-shadow-md`}>
                                                {active.title}
                                            </div>
                                            <div className={`text-[10px] ${isLightColor(active.gradient) ? 'text-athena-bg/80' : 'text-white/70'} font-medium z-10 drop-shadow-sm uppercase tracking-wider`}>
                                                {active.author || 'Unknown Author'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full max-w-[240px] mt-auto">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <div className="text-[12px] font-medium">p.{active.current} <span className="text-athena-text-muted/50 text-[10px]">/ {active.pages}</span></div>
                                            <div className="text-[12px] font-serif font-bold" style={{ color: active.gradient?.match(/#[0-9a-fA-F]{6}/)?.[0] || 'rgb(var(--athena-gold))' }}>{pct}%</div>
                                        </div>
                                        <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: active.gradient }} />
                                        </div>
                                        {activeVelocity && (
                                            <div className="text-[10px] text-athena-text-muted mt-1.5">
                                                ~{activeVelocity.daysLeft} days left &middot; Finish by {format(activeVelocity.projectedFinish, 'MMM d')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col flex-1 h-full items-center justify-center p-2 md:p-4 text-center">
                                <BookMarked className="w-8 h-8 text-athena-text-muted/30 mb-4" />
                                <div className="text-sm font-semibold text-athena-text-primary">No Active Book</div>
                                <div className="text-xs text-athena-text-muted">Select a book from the Queue to start reading.</div>
                            </div>
                        )}

                        {/* Mobile stat strip */}
                        <div className="flex md:hidden text-xs text-athena-text-muted pt-2 border-t border-athena-border/30 mt-2">
                            <span>{doneBooksYear.length} finished this year</span>
                        </div>
                    </Card>
                </motion.div>

                {/* Mobile Queue + Stats Strip */}
                <div className="md:hidden space-y-2">
                    {/* Queue chips */}
                    {nextUp.length > 0 && (
                        <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            <div className="flex gap-2 min-w-max">
                                {nextUp.map((b, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-athena-border/30 bg-white/[0.02] shrink-0 min-h-[44px]" style={{ maxWidth: 180 }}>
                                        <div className="w-6 h-8 rounded-[2px] shrink-0" style={{ background: b.gradient }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-semibold truncate">{b.title}</div>
                                            <div className="text-[10px] text-athena-text-muted truncate">{b.author}</div>
                                        </div>
                                        <button
                                            className="text-[10px] text-athena-gold font-bold uppercase tracking-wider shrink-0 px-2 py-1 rounded border border-athena-gold/30 min-h-[32px]"
                                            onClick={async () => {
                                                const { data: { user } } = await supabase.auth.getUser();
                                                const userId = user?.id || SINGLE_USER_ID;
                                                await supabase.from('books').update({ is_active: false }).eq('user_id', userId);
                                                const { error } = await supabase.from('books').update({ is_active: true }).eq('id', b.id);
                                                if (error) toast.error('Failed to set active');
                                                else { toast.success('Book set to active'); fetchBooks(); }
                                            }}
                                        >
                                            Start
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Finished Books */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="hidden md:block h-full">
                    <Card className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm overflow-hidden h-full flex flex-col p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <BookOpen className="text-athena-text-muted" size={12} />
                                <div className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Books Finished</div>
                            </div>
                            <span className="text-[10px] text-athena-text-muted/40">{totalRead} total</span>
                        </div>

                        <div className="flex-1 space-y-2 overflow-y-auto min-h-[120px] mb-4 pr-1">
                            {doneBooksYear.map((b, i) => (
                                <ContextMenu key={i}>
                                    <ContextMenuTrigger asChild>
                                        <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] rounded-md border border-athena-border/30 hover:border-athena-gold/30 transition-all cursor-pointer group flex-shrink-0" onClick={() => setEditBook(b)}>
                                            <div className="flex items-baseline gap-2 min-w-0 pr-2">
                                                <span className="text-[11px] font-semibold truncate leading-none group-hover:text-athena-gold transition-colors">{b.title}</span>
                                                <span className="text-[10px] text-athena-text-muted/50 truncate leading-none">{b.author}</span>
                                            </div>
                                            <span className="text-[10px] font-medium text-athena-text-muted/60 shrink-0 leading-none">{b.pages}p</span>
                                        </div>
                                    </ContextMenuTrigger>
                                    <ContextMenuContent className="w-56 bg-athena-panel border-athena-border text-athena-text-primary">
                                        <ContextMenuItem
                                            className="text-red-400 focus:text-red-300 focus:bg-red-400/10 cursor-pointer flex items-center gap-2 text-[11px] font-medium"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setLoading(true);
                                                const { error } = await supabase.from('books').update({ year_finished: 'Archived' }).eq('id', b.id);
                                                if (error) { toast.error('Failed to remove book'); }
                                                else { toast.success('Removed from this section'); fetchBooks(); }
                                                setLoading(false);
                                            }}
                                        >
                                            <Trash2 size={12} /> Remove from this section
                                        </ContextMenuItem>
                                    </ContextMenuContent>
                                </ContextMenu>
                            ))}
                        </div>

                    </Card>
                </motion.div>

                {/* 3. Queue */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hidden md:block h-full">
                    <Card
                        className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm p-5 h-full flex flex-col"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, 'Queue')}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Library size={12} className="text-athena-text-muted" />
                                <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">Queue</span>
                            </div>
                            <span className="text-[10px] text-athena-text-muted/40">{nextUp.length} next</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-3 mt-2 overflow-y-auto pr-1">
                            {nextUp.map((b, i) => (
                                <div
                                    key={i}
                                    className="flex-1 flex items-center gap-4 px-4 py-2 bg-white/[0.02] rounded-xl border border-athena-border/30 hover:border-athena-gold/30 transition-all group"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, b)}
                                >
                                    <div className="w-8 h-11 md:w-10 md:h-14 rounded-[2px] shrink-0 shadow-md transition-transform cursor-pointer" style={{ background: b.gradient }} onClick={() => setEditBook(b)} />
                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditBook(b)}>
                                        <div className="text-[13px] font-semibold truncate leading-tight mb-0.5 group-hover:text-athena-gold transition-colors">{b.title}</div>
                                        <div className="text-[10px] text-athena-text-muted/60">{b.author}</div>
                                        <div className="text-[10px] text-athena-text-muted/40 mt-1">{b.pages} pages</div>
                                    </div>

                                    {/* Direct Make Active Button */}
                                    <div
                                        className="md:opacity-0 md:group-hover:opacity-100 transition-opacity p-2 rounded-full bg-white/5 hover:bg-athena-gold/20 text-athena-text-muted hover:text-athena-gold cursor-pointer shrink-0"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            setLoading(true);
                                            const { data: { user } } = await supabase.auth.getUser();
                                            const userId = user?.id || SINGLE_USER_ID;

                                            // Deactivate current
                                            await supabase.from('books').update({ is_active: false }).eq('user_id', userId);
                                            // Activate target
                                            const { error } = await supabase.from('books').update({ is_active: true }).eq('id', b.id);

                                            if (error) toast.error('Failed to set active');
                                            else { toast.success('Book set to active'); fetchBooks(); }
                                            setLoading(false);
                                        }}
                                        title="Make Active Book"
                                    >
                                        <BookOpen size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {nextUp.length < 3 && (
                            <div onClick={() => setAddDialogOpen(true)} className="mt-3 p-2.5 rounded-xl border border-dashed border-athena-border/30 text-center cursor-pointer hover:border-athena-gold/40 hover:bg-white/[0.01] transition-all flex items-center justify-center gap-2">
                                <span className="text-[10px] text-athena-text-muted/50 font-medium">+ Add to Queue</span>
                            </div>
                        )}
                    </Card>
                </motion.div>
            </div>

            {/* Row 2: Full-width Book Shelf */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <Card
                    id="bookshelf"
                    className="bg-athena-panel/60 border-athena-border/50 backdrop-blur-sm p-3 md:p-6 overflow-hidden scroll-mt-4"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'Archive')}
                >
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <BookMarked size={12} className="text-athena-text-muted" />
                            <span className="text-[10px] text-athena-text-muted uppercase tracking-[0.2em] font-bold">The Bookshelf</span>
                            <span className="text-[10px] text-athena-text-muted/40 ml-2">{books.length} volumes</span>
                        </div>
                        <button data-onboarding="add-book-button" onClick={() => setAddDialogOpen(true)} className="text-athena-text-muted/60 hover:text-athena-gold transition-colors font-medium flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center">
                            <Plus size={14} />
                            <span className="hidden md:inline text-[10px]">Add Volume</span>
                        </button>
                    </div>

                    {/* Shelf */}
                    {isMobile ? (
                        <div className="space-y-4 mt-4">
                            {archiveInProgress.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Reading</div>
                                    <div className="space-y-2">
                                        {archiveInProgress.map((book, i) => {
                                            const bpct = book.pages > 0 ? Math.round((book.current / book.pages) * 100) : 0;
                                            return <MobileBookCard key={`ip-${i}`} book={book} pct={bpct} onEdit={setEditBook} onAction={handleMobileBookAction} />;
                                        })}
                                    </div>
                                </div>
                            )}
                            {archiveNew.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">New</div>
                                    <div className="space-y-2">
                                        {archiveNew.map((book, i) => (
                                            <MobileBookCard key={`n-${i}`} book={book} onEdit={setEditBook} onAction={handleMobileBookAction} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {archiveFinished.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold mb-2">Finished</div>
                                    <div className="space-y-2">
                                        {archiveFinished.map((book, i) => (
                                            <MobileBookCard key={`d-${i}`} book={book} pct={100} onEdit={setEditBook} onAction={handleMobileBookAction} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="relative mt-6 pb-2">
                                <div className="flex gap-1.5 md:gap-6 items-end px-2 md:px-10 pt-4 pb-0 relative z-10 justify-start overflow-x-auto hide-scrollbar snap-x snap-mandatory">

                                    {/* In Progress Books */}
                                    {archiveInProgress.length > 0 && <span className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold shrink-0 self-end mb-1 md:hidden">Reading</span>}
                                    {archiveInProgress.length > 0 && <div className="flex gap-1 items-end relative">
                                        {archiveInProgress.map((book, i) => {
                                            const bpct = book.pages > 0 ? Math.round((book.current / book.pages) * 100) : 0;
                                            const spineH = 150 + ((book.pages || 200) / 600) * 60;
                                            return (
                                                <div
                                                    key={`ip-${i}`}
                                                    className="group relative flex flex-col items-center shrink-0"
                                                    style={{ height: spineH }}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, book)}
                                                >
                                                    <div
                                                        onClick={() => setEditBook(book)}
                                                        className="relative w-[44px] md:w-[44px] md:group-hover:w-[120px] transition-all duration-300 ease-out overflow-hidden rounded-t-[4px] rounded-b-[1px] cursor-pointer origin-bottom snap-start h-[120px] md:h-auto md:max-h-none"
                                                        style={{
                                                            height: spineH,
                                                            background: book.gradient,
                                                            boxShadow: '3px 3px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                        }}
                                                    >
                                                        {/* Depth overlays */}
                                                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] via-transparent to-black/20 pointer-events-none" />
                                                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/30 pointer-events-none" />
                                                        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-white/[0.08] pointer-events-none" />

                                                        {/* Spine text */}
                                                        <div className="absolute inset-x-0 bottom-3 top-3 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-150 overflow-hidden px-1 z-20">
                                                            <span className={`text-[10px] md:text-xs font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/90'} font-serif leading-[1.3] text-center`} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>{book.title}</span>
                                                        </div>

                                                        {/* Hover cover */}
                                                        <div className="absolute inset-0 w-[120px] p-3 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 z-20">
                                                            <div>
                                                                <div className={`text-[13px] font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/95'} leading-tight font-serif break-words mb-1 overflow-visible`}>{book.title}</div>
                                                                <div className={`text-[10px] ${isLightColor(book.gradient) ? 'text-athena-bg/80' : 'text-white/60'} leading-tight`}>{book.author}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className={`text-[10px] font-serif ${isLightColor(book.gradient) ? 'text-athena-bg/80' : 'text-white/40'} font-bold`}>{bpct}%</div>
                                                                <div className="flex-1 h-[3px] bg-white/10 rounded-full overflow-hidden ml-auto">
                                                                    <div className="h-full rounded-full bg-athena-gold" style={{ width: `${bpct}%` }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>}

                                    {/* New Books */}
                                    {archiveNew.length > 0 && <span className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold shrink-0 self-end mb-1 ml-4 md:hidden">New</span>}
                                    {archiveNew.length > 0 && <div className="flex gap-1 items-end relative ml-4">
                                        {archiveNew.map((book, i) => {
                                            const spineH = 150 + ((book.pages || 200) / 600) * 60;
                                            return (
                                                <div
                                                    key={`n-${i}`}
                                                    className="group relative flex flex-col items-center shrink-0"
                                                    style={{ height: spineH }}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, book)}
                                                >
                                                    <div
                                                        onClick={() => setEditBook(book)}
                                                        className="relative w-[44px] md:w-[44px] md:group-hover:w-[120px] transition-all duration-300 ease-out overflow-hidden rounded-t-[4px] rounded-b-[1px] cursor-pointer origin-bottom snap-start h-[120px] md:h-auto md:max-h-none"
                                                        style={{
                                                            height: spineH,
                                                            background: book.gradient,
                                                            boxShadow: '3px 3px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                            opacity: 0.95,
                                                        }}
                                                    >
                                                        {/* Depth overlays */}
                                                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] via-transparent to-black/20 pointer-events-none" />
                                                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/30 pointer-events-none" />
                                                        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-white/[0.08] pointer-events-none" />

                                                        {/* Spine text */}
                                                        <div className="absolute inset-x-0 bottom-3 top-3 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-150 overflow-hidden px-1 z-20">
                                                            <span className={`text-[10px] md:text-xs font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/90'} font-serif leading-[1.3] text-center`} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>{book.title}</span>
                                                        </div>

                                                        {/* Hover cover */}
                                                        <div className="absolute inset-0 w-[120px] p-3 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 z-20">
                                                            <div>
                                                                <div className={`text-[13px] font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/95'} leading-tight font-serif break-words mb-1 overflow-visible`}>{book.title}</div>
                                                                <div className={`text-[10px] ${isLightColor(book.gradient) ? 'text-athena-bg/80' : 'text-white/60'} leading-tight`}>{book.author}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>}

                                    {/* Finished Books */}
                                    {archiveFinished.length > 0 && <span className="text-[10px] uppercase tracking-widest text-athena-text-muted font-semibold shrink-0 self-end mb-1 ml-4 md:hidden">Finished</span>}
                                    {archiveFinished.length > 0 && <div className="flex gap-1 items-end relative ml-4">
                                        {archiveFinished.map((book, i) => {
                                            const bpct = 100;
                                            const sc = "#34d399";
                                            const spineH = 150 + ((book.pages || 200) / 600) * 60;
                                            return (
                                                <div
                                                    key={`d-${i}`}
                                                    className="group relative flex flex-col items-center shrink-0"
                                                    style={{ height: spineH }}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, book)}
                                                >
                                                    <div
                                                        onClick={() => setEditBook(book)}
                                                        className="relative w-[44px] md:w-[44px] md:group-hover:w-[120px] transition-all duration-300 ease-out overflow-hidden rounded-t-[4px] rounded-b-[1px] cursor-pointer origin-bottom snap-start h-[120px] md:h-auto md:max-h-none"
                                                        style={{
                                                            height: spineH,
                                                            background: book.gradient,
                                                            boxShadow: '3px 3px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                            opacity: 0.85,
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                                    >
                                                        {/* Depth overlays */}
                                                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.1] via-transparent to-black/20 pointer-events-none z-10" />
                                                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-black/40 pointer-events-none z-10" />
                                                        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-white/[0.08] pointer-events-none z-10" />

                                                        {/* Dim overlay for finished spines */}
                                                        <div className="absolute inset-0 bg-black/10 pointer-events-none z-0 group-hover:opacity-0 transition-opacity" />

                                                        {/* Spine text */}
                                                        <div className="absolute inset-x-0 bottom-3 top-3 flex items-center justify-center opacity-100 group-hover:opacity-0 transition-opacity duration-150 overflow-hidden px-1 z-20">
                                                            <span className={`text-[10px] md:text-xs font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/70'} font-serif leading-[1.3] text-center`} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>{book.title}</span>
                                                        </div>

                                                        {/* Hover cover */}
                                                        <div className="absolute inset-0 w-[120px] p-3 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 z-20">
                                                            <div>
                                                                <div className={`text-[12px] font-bold ${isLightColor(book.gradient) ? 'text-athena-bg' : 'text-white/95'} leading-tight font-serif break-words mb-1 overflow-visible`}>{book.title}</div>
                                                                <div className={`text-[10px] ${isLightColor(book.gradient) ? 'text-athena-bg/70' : 'text-white/50'}`}>{book.author}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <div className="flex items-center gap-0.5"><Check size={7} className="text-emerald-400" /><span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Finished</span></div>
                                                                <div className="flex-1 h-[3px] bg-white/10 rounded-full overflow-hidden ml-auto">
                                                                    <div className="h-full rounded-full" style={{ width: `${bpct}%`, background: sc }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>}
                                </div>

                                {/* Wooden shelf ledge */}
                                <div className="relative h-[6px] mx-1 rounded-b-[2px] z-20" style={{
                                    background: 'linear-gradient(180deg, #3a2e20 0%, #2a2018 40%, #1a1510 100%)',
                                    boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                                }} />
                                <div className="h-[2px] mx-2 rounded-b-sm" style={{ background: 'rgba(0,0,0,0.3)', filter: 'blur(2px)' }} />
                            </div>
                        </>
                    )}
                </Card>
            </motion.div>

            {/* Dialogs */}
            <AddBookDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onSuccess={fetchBooks} />
            <EditBookDialog book={editBook} open={!!editBook} onOpenChange={(open) => !open && setEditBook(null)} onSuccess={() => { fetchBooks(); setEditBook(null); }} />

            {/* Mobile page update modal */}
            <AnimatePresence>
                {mobileUpdateOpen && active && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-50 md:hidden"
                            onClick={() => setMobileUpdateOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 z-50 flex items-center justify-center px-6 md:hidden pointer-events-none"
                        >
                            <div className="bg-athena-panel border border-athena-border rounded-2xl p-5 w-full max-w-xs space-y-4 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                                <div>
                                    <div className="text-[9px] text-athena-text-muted uppercase tracking-[0.25em] font-bold mb-1">Update Page</div>
                                    <div className="text-sm font-serif text-athena-text-primary truncate">{active.title}</div>
                                </div>
                                <div className="flex items-center gap-3 justify-center">
                                    <button
                                        className="w-10 h-10 rounded-full border border-athena-border flex items-center justify-center text-athena-text-muted text-lg"
                                        onClick={() => setMobileUpdatePage(String(Math.max(0, parseInt(mobileUpdatePage || '0') - 1)))}
                                    >-</button>
                                    <input
                                        type="number"
                                        value={mobileUpdatePage}
                                        onChange={(e) => setMobileUpdatePage(e.target.value)}
                                        className="w-20 text-center bg-white/[0.03] border border-athena-border rounded-xl px-2 py-2 text-lg font-serif text-athena-text-primary focus:outline-none focus:border-athena-gold/30"
                                    />
                                    <button
                                        className="w-10 h-10 rounded-full border border-athena-border flex items-center justify-center text-athena-text-muted text-lg"
                                        onClick={() => setMobileUpdatePage(String(parseInt(mobileUpdatePage || '0') + 1))}
                                    >+</button>
                                </div>
                                <div className="text-center text-xs text-athena-text-muted">of {active.pages} pages</div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setMobileUpdateOpen(false)}
                                        className="flex-1 px-3 py-2.5 rounded-xl border border-athena-border text-athena-text-muted text-sm min-h-[44px]"
                                    >Cancel</button>
                                    <button
                                        className="flex-1 px-3 py-2.5 rounded-xl bg-athena-gold text-athena-bg text-sm font-semibold min-h-[44px]"
                                        onClick={async () => {
                                            const page = parseInt(mobileUpdatePage || '0');
                                            const total = active.pages || active.total_pages || 1;
                                            let status = 'In Progress';
                                            let yearFinished = active.year_finished;
                                            if (page >= total) { status = 'Done'; yearFinished = new Date().getFullYear().toString(); }
                                            else if (page <= 0) { status = 'Not started'; }
                                            const { error } = await supabase.from('books').update({ current_page: page, status, year_finished: yearFinished }).eq('id', active.id);
                                            if (error) toast.error('Failed to update');
                                            else { toast.success('Page updated'); fetchBooks(); }
                                            setMobileUpdateOpen(false);
                                        }}
                                    >Save</button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Mobile contextual action bar */}
            <div className="fixed bottom-0 left-0 right-0 md:hidden bg-athena-bg/90 backdrop-blur-sm border-t border-athena-border z-40 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center justify-around h-14">
                    <button onClick={() => setAddDialogOpen(true)} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                        <Plus size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25 uppercase tracking-widest">Add Book</span>
                    </button>
                    <button onClick={() => { if (active) { setMobileUpdateOpen(true); setMobileUpdatePage(String(active.current || 0)); } }} className="flex flex-col items-center gap-0.5 min-w-[48px] min-h-[44px] justify-center">
                        <BookOpen size={18} className="text-white/25" />
                        <span className="text-[10px] text-white/25 uppercase tracking-widest">Update</span>
                    </button>
                </div>
            </div>

        </div>
    );
}

const TEST_USER_ID = SINGLE_USER_ID;

const PRESET_COLORS = [
    { name: 'Ivory', value: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' },
    { name: 'Slate', value: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)' },
    { name: 'Mocha', value: 'linear-gradient(135deg, #5c4033 0%, #2b1d16 100%)' },
    { name: 'Charcoal', value: 'linear-gradient(135deg, #3f3f46 0%, #18181b 100%)' },
    { name: 'Burgundy', value: 'linear-gradient(135deg, #5e2129 0%, #2d0e12 100%)' },
    { name: 'Olive', value: 'linear-gradient(135deg, #4b5320 0%, #23280c 100%)' },
    { name: 'Navy', value: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)' },
    { name: 'Rust', value: 'linear-gradient(135deg, #7c2d12 0%, #3f1505 100%)' },
    { name: 'Camel', value: 'linear-gradient(135deg, #9ca3af 0%, #4b5563 100%)' },
    { name: 'Espresso', value: 'linear-gradient(135deg, #382c2c 0%, #1d1515 100%)' },
    { name: 'Sage', value: 'linear-gradient(135deg, #78866B 0%, #4B5320 100%)' },
    { name: 'Indigo', value: 'linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)' },
    { name: 'Crimson', value: 'linear-gradient(135deg, #831843 0%, #4c0519 100%)' },
    { name: 'Teal', value: 'linear-gradient(135deg, #0f766e 0%, #042f2e 100%)' },
    { name: 'Amber', value: 'linear-gradient(135deg, #b45309 0%, #78350f 100%)' },
    // 8 additional refined, distinct, but neutral tones
    { name: 'Gold', value: 'linear-gradient(135deg, rgb(var(--athena-gold)) 0%, rgb(var(--athena-gold-dim)) 100%)' },
    { name: 'Blush', value: 'linear-gradient(135deg, #e9d5db 0%, #bca5ab 100%)' }, // neutral pink
    { name: 'Mint', value: 'linear-gradient(135deg, #d4e2d4 0%, #9cb09c 100%)' }, // neutral pale green
    { name: 'Lilac', value: 'linear-gradient(135deg, #d8d0e5 0%, #a291b5 100%)' }, // neutral purple
    { name: 'Ochre', value: 'linear-gradient(135deg, #cc7722 0%, #87490c 100%)' }, // deep yellowish orange
    { name: 'Pearl', value: 'linear-gradient(135deg, #fefbfc 0%, #e6dddf 100%)' }, // extremely light warm tone
    { name: 'Denim', value: 'linear-gradient(135deg, #5e7fa3 0%, #2f4968 100%)' }, // faded soft blue
    { name: 'Rose', value: 'linear-gradient(135deg, #c28888 0%, #854b4b 100%)' } // dusky muted red-pink
];

function ColorPickerRow({ value, onChange }: { value: string | null, onChange: (v: string | null) => void }) {
    return (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
            <div
                onClick={() => onChange(null)}
                className={`w-6 h-6 rounded-full border-2 cursor-pointer flex items-center justify-center text-[10px] font-bold ${value === null ? 'border-athena-gold text-athena-gold' : 'border-white/20 text-white/50 hover:border-white/50'}`}
                title="Auto-generate color based on title"
            >
                A
            </div>
            {PRESET_COLORS.map(c => (
                <div
                    key={c.name}
                    onClick={() => onChange(c.value)}
                    className={`w-6 h-6 rounded-full cursor-pointer border-2 transition-all ${value === c.value ? 'border-athena-gold scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                    style={{ background: c.value }}
                    title={c.name}
                />
            ))}
        </div>
    );
}

export function AddBookDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
    const [formData, setFormData] = useState({
        name: '',
        author: '',
        total_pages: '',
        current_page: '0'
    });
    const [color, setColor] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const supabase = createClient();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || TEST_USER_ID;

        const current = parseInt(formData.current_page || '0');
        const total = parseInt(formData.total_pages || '1');

        let computedStatus = 'Not started';
        if (total > 0 && current >= total) {
            computedStatus = 'Done';
        } else if (current > 0) {
            computedStatus = 'In Progress';
        }

        const is_active = false;

        const { error } = await supabase.from('books').insert({
            user_id: userId,
            name: formData.name,
            author: formData.author || null,
            total_pages: total,
            current_page: current,
            status: computedStatus,
            is_active: is_active,
            color: color,
            year_finished: computedStatus === 'Done' ? new Date().getFullYear().toString() : null
        });

        if (error) { toast.error('Failed to add book'); }
        else {
            toast.success('Book added successfully');
            onSuccess();
            onOpenChange(false);
            setFormData({ name: '', author: '', total_pages: '', current_page: '0' });
            setColor(null);
        }
        setSaving(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-white/10 z-50 w-[90vw] max-w-md md:max-w-xl max-h-[85vh] overflow-y-auto text-[#e5e5e5]">
                <DialogHeader>
                    <DialogTitle className="font-serif">Add New Volume</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    <div>
                        <Label>Title *</Label>
                        <Input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                    </div>
                    <div>
                        <Label>Author</Label>
                        <Input value={formData.author} onChange={(e) => setFormData({ ...formData, author: e.target.value })} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Total Pages *</Label>
                            <Input required type="number" min="1" value={formData.total_pages} onChange={(e) => setFormData({ ...formData, total_pages: e.target.value })} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                        </div>
                        <div>
                            <Label>Current Page</Label>
                            <Input type="number" min="0" value={formData.current_page} onChange={(e) => setFormData({ ...formData, current_page: e.target.value })} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                        </div>
                    </div>
                    <div className="pt-2">
                        <Label>Spine Color</Label>
                        <ColorPickerRow value={color} onChange={setColor} />
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-white/5 mt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-white/5 hover:text-white">Cancel</Button>
                        <Button type="submit" disabled={saving} className="bg-athena-gold text-[#020204] hover:bg-athena-gold-bright font-semibold">{saving ? 'Adding...' : 'Add Book'}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function EditBookDialog({ book, open, onOpenChange, onSuccess }: { book: any; open: boolean; onOpenChange: (open: boolean) => void; onSuccess: () => void }) {
    const [name, setName] = useState(book?.title || book?.name || '');
    const [author, setAuthor] = useState(book?.author || '');
    const [currentPage, setCurrentPage] = useState((book?.current || book?.current_page || 0).toString());
    const [color, setColor] = useState<string | null>(book?.color || null);
    const [saving, setSaving] = useState(false);
    const supabase = createClient();

    // Sync state if book changes
    useEffect(() => {
        if (book) {
            setName(book.name || book.title || '');
            setAuthor(book.author || '');
            setCurrentPage((book.current_page || book.current || 0).toString());
            setColor(book.color || null);
        }
    }, [book]);

    async function handleUpdate() {
        if (!book) return;
        setSaving(true);
        let error;

        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || TEST_USER_ID;

        const current = parseInt(currentPage || '0');
        // fallback to standard max to prevent accidental 1 page calculations closing the book
        const total = book.pages || book.total_pages || Math.max(current, 1);

        let computedStatus = 'Not started';
        let computedYear = book.year_finished;

        if (total > 0 && current >= total) {
            computedStatus = 'Done';
            computedYear = (computedYear === 'Queue' || computedYear === 'In progress' || !computedYear) ? new Date().getFullYear().toString() : computedYear;
        } else if (current > 0) {
            computedStatus = 'In Progress';
            computedYear = 'In progress';
        } else {
            // Not started
            if (computedYear === 'Queue') {
                // Keep it in queue
            } else {
                computedYear = null;
            }
        }

        const is_active = book.is_active;

        if (is_active && !book.is_active) {
            await supabase.from('books').update({ is_active: false }).eq('user_id', userId);
        }

        const updateRes = await supabase.from('books').update({
            name,
            author: author || null,
            current_page: current,
            status: computedStatus,
            is_active: is_active,
            color: color,
            year_finished: computedYear
        }).eq('id', book.id);

        error = updateRes.error;

        if (error) { toast.error('Failed to update book'); }
        else { toast.success('Book updated'); onSuccess(); onOpenChange(false); }
        setSaving(false);
    }

    if (!book) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0a] border-white/10 z-50 w-[90vw] max-w-md md:max-w-xl max-h-[85vh] overflow-y-auto text-[#e5e5e5]">
                <DialogHeader>
                    <DialogTitle className="font-serif text-white">{book.name || book.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                    <div>
                        <Label>Title</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                    </div>
                    <div>
                        <Label>Author</Label>
                        <Input value={author} onChange={(e) => setAuthor(e.target.value)} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Current Page</Label>
                            <div className="relative">
                                <Input type="number" min="0" max={book.pages || book.total_pages} value={currentPage} onChange={(e) => setCurrentPage(e.target.value)} className="bg-[#0e0c0a] border-white/10 h-10 text-white placeholder:text-[#525252] focus-visible:ring-athena-gold mt-1 pr-16" />
                                <div className="absolute right-3 top-3 text-[10px] text-[#737373] mt-1 font-medium">/ {book.pages || book.total_pages} set</div>
                            </div>
                        </div>
                    </div>
                    <div className="pt-2">
                        <Label>Spine Color</Label>
                        <ColorPickerRow value={color} onChange={setColor} />
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-white/5 mt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-white/5 hover:text-white">Cancel</Button>
                        <Button onClick={handleUpdate} disabled={saving} className="bg-athena-gold text-[#020204] hover:bg-athena-gold-bright font-semibold">{saving ? 'Updating...' : 'Update'}</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
