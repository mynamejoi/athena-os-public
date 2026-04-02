'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain } from 'lucide-react';
import { format } from 'date-fns';

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    inputRef.current?.focus();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim() || loading) return;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        setUnlocking(true);
        // Brief delay for unlock animation, then full navigation to pick up cookie
        setTimeout(() => { window.location.href = '/'; }, 800);
      } else {
        setError(true);
        setPassphrase('');
        inputRef.current?.focus();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-athena-bg flex items-center justify-center relative overflow-hidden font-sans selection:bg-athena-gold-dim/30 pb-[env(safe-area-inset-bottom)]">
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[400px] md:w-[900px] md:h-[500px] bg-athena-gold/5 rounded-full blur-[100px] md:blur-[150px]" />
      </div>

      {/* Edge lines */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-athena-border to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-athena-border to-transparent" />

      {/* Mobile unlock flash overlay */}
      <AnimatePresence>
        {unlocking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.15, 0] }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50 bg-athena-gold pointer-events-none block md:hidden"
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col items-center gap-6 md:gap-8 px-4">
        {/* Mobile Lock Screen Time */}
        {mounted && (
          <div className="block md:hidden text-center mb-4" suppressHydrationWarning>
            <p className="text-6xl font-light text-athena-text-primary font-serif tabular-nums">
              {format(currentTime, 'h:mm')}
            </p>
            <p className="text-base text-athena-text-muted tracking-wide mt-2">
              {format(currentTime, 'EEEE, MMMM d')}
            </p>
          </div>
        )}

        {/* Brain Icon */}
        <motion.div
          animate={unlocking ? {
            scale: [1.1, 1.3, 1],
            filter: ['drop-shadow(0 0 15px rgb(var(--athena-gold)))', 'drop-shadow(0 0 30px rgb(var(--athena-gold)))', 'drop-shadow(0 0 0px transparent)'],
          } : {
            scale: [1, 1.05, 1],
          }}
          transition={unlocking ? { duration: 0.8 } : {
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <Brain className={`w-12 h-12 transition-colors duration-500 ${unlocking ? 'text-athena-gold' : 'text-athena-gold/60'}`} />
        </motion.div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div className="flex items-center gap-4">
            <div className="h-[2px] w-10 md:w-16 bg-gradient-to-r from-transparent to-athena-gold opacity-60" />
            <h1 className="text-xl md:text-2xl font-serif text-athena-gold tracking-[0.2em] md:tracking-[0.4em] uppercase">
              Project Athena
            </h1>
            <div className="h-[2px] w-10 md:w-16 bg-gradient-to-l from-transparent to-athena-gold opacity-60" />
          </div>
        </div>

        {/* Login Card */}
        <AnimatePresence mode="wait">
          {!unlocking && (
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-xs md:w-80"
            >
              <motion.div
                animate={error ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="password"
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      setError(false);
                    }}
                    placeholder="Enter passphrase"
                    className={`w-full border rounded-xl min-h-[52px] md:min-h-0 md:rounded-none md:border-0 md:border-b ${
                      error ? 'border-red-500/50' : 'border-white/[0.06] md:border-athena-gold/20'
                    } bg-white/[0.03] md:bg-transparent px-4 py-3 md:px-2 text-athena-text-primary placeholder:text-athena-text-muted/30 focus:outline-none focus:border-athena-gold/30 md:focus:border-athena-gold/50 transition-all font-mono text-base md:text-sm tracking-[0.3em] text-center`}
                    disabled={loading}
                  />
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute -bottom-6 left-0 right-0 text-red-400/80 text-xs tracking-wide text-center md:text-left"
                    >
                      Invalid passphrase
                    </motion.p>
                  )}
                </div>
              </motion.div>

              {/* Mobile hint - placeholder now handles this */}
              <p className="hidden text-center text-xs text-athena-text-muted/40 mt-8 tracking-widest uppercase animate-pulse">
                Enter passphrase
              </p>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Unlocking indicator */}
        {unlocking && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-athena-gold/60 text-sm tracking-[0.2em] uppercase"
          >
            Authenticated
          </motion.p>
        )}
      </div>
    </div>
  );
}
