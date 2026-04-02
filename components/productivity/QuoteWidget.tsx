'use client';

import { useState, useEffect } from 'react';
import { getQuoteOfTheDay, type Quote } from '@/lib/quotes-data';

export function QuoteWidget() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setQuote(getQuoteOfTheDay());
  }, []);

  if (!quote) return null;

  return (
    <>
      <div
        className="relative w-full mx-auto px-2 py-2 md:p-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 md:cursor-default cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <p className="text-xs md:text-xl font-serif font-light text-[var(--athena-gold)]/40 md:text-athena-text-warm tracking-normal md:tracking-wide leading-relaxed md:leading-normal whitespace-pre-wrap italic line-clamp-2 md:line-clamp-none">
          &ldquo;{quote.text}&rdquo;
        </p>
        <cite className="hidden md:block mt-3 text-xs font-sans font-medium text-athena-gold-dim not-italic uppercase tracking-widest">
          &mdash; {quote.author}
        </cite>
      </div>

      {/* Mobile full-quote modal */}
      {expanded && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-athena-panel border border-athena-gold/20 rounded-xl px-6 py-8 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-serif font-light text-athena-text-warm leading-relaxed italic">
              &ldquo;{quote.text}&rdquo;
            </p>
            <cite className="block mt-4 text-[10px] font-sans font-medium text-athena-gold-dim not-italic uppercase tracking-widest">
              &mdash; {quote.author}
            </cite>
            <button
              onClick={() => setExpanded(false)}
              className="mt-6 w-full h-11 bg-athena-gold/10 border border-athena-gold/30 rounded-lg text-sm text-athena-gold font-medium active:bg-athena-gold/20 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
