'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Lock, Eye, EyeOff, Key, Check, ChevronRight, Loader2, ExternalLink, SkipForward } from 'lucide-react';

type Step = 1 | 2 | 3;

const stepVariants = {
  enterFromRight: { opacity: 0, x: 40 },
  enterFromLeft: { opacity: 0, x: -40 },
  center: { opacity: 1, x: 0 },
  exitToLeft: { opacity: 0, x: -40 },
  exitToRight: { opacity: 0, x: 40 },
};

const inputClass =
  'w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 pr-10 py-3 min-h-[52px] text-athena-text-primary placeholder:text-athena-text-muted/30 focus:outline-none focus:border-athena-gold/30 transition-all text-base';

const inputClassNoToggle =
  'w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 min-h-[52px] text-athena-text-primary placeholder:text-athena-text-muted/30 focus:outline-none focus:border-athena-gold/30 transition-all text-base';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [saving, setSaving] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const step1Ref = useRef<HTMLInputElement>(null);
  const step2Ref = useRef<HTMLInputElement>(null);

  // Step 1: Passphrase
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 2: Anthropic
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyError, setKeyError] = useState('');

  // Step 3: WHOOP
  const [whoopClientId, setWhoopClientId] = useState('');
  const [whoopClientSecret, setWhoopClientSecret] = useState('');

  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.complete) router.replace('/login');
        else setCheckingStatus(false);
      })
      .catch(() => setCheckingStatus(false));
  }, [router]);

  // Auto-focus inputs on step change
  useEffect(() => {
    const t = setTimeout(() => {
      if (step === 1) step1Ref.current?.focus();
      if (step === 2) step2Ref.current?.focus();
    }, 350);
    return () => clearTimeout(t);
  }, [step]);

  const passphraseValid = passphrase.length >= 8 && passphrase === confirmPassphrase;

  function goToStep(target: Step) {
    setDirection(target > step ? 'forward' : 'back');
    setStep(target);
  }

  async function testAnthropicKey() {
    setTestingKey(true);
    setKeyError('');
    setKeyValid(null);
    try {
      const res = await fetch('/api/setup/test-anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: anthropicKey }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyValid(true);
      } else {
        setKeyValid(false);
        setKeyError(data.error || 'Invalid key');
      }
    } catch {
      setKeyValid(false);
      setKeyError('Connection failed');
    } finally {
      setTestingKey(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setGlobalError('');
    try {
      const res = await fetch('/api/setup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase,
          anthropicKey: anthropicKey || undefined,
          whoopClientId: whoopClientId || undefined,
          whoopClientSecret: whoopClientSecret || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Ensure onboarding tour shows after first login
        localStorage.setItem('athena_onboarding', JSON.stringify({
          currentStep: 0,
          completed: false,
          skippedSteps: [],
          createdIds: { habits: [], projects: [], tasks: [], books: [], goals: [] },
          testMode: false,
          whoopConnected: false,
        }));
        // Full page reload ensures middleware picks up new process.env values
        window.location.href = '/login';
        return;
      } else {
        setGlobalError(data.error || 'Setup failed');
      }
    } catch {
      setGlobalError('Connection failed');
    } finally {
      setSaving(false);
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen w-full bg-athena-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-athena-gold animate-spin" />
      </div>
    );
  }

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

      <div className="relative z-10 flex flex-col items-center gap-6 md:gap-8 px-4 w-full max-w-lg">
        {/* Brain Icon */}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Brain className="w-12 h-12 text-athena-gold/60" />
        </motion.div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div className="flex items-center gap-4">
            <div className="h-[2px] w-10 md:w-16 bg-gradient-to-r from-transparent to-athena-gold opacity-60" />
            <h1 className="text-xl md:text-2xl font-serif text-athena-gold tracking-[0.2em] md:tracking-[0.4em] uppercase">
              Set Up Athena
            </h1>
            <div className="h-[2px] w-10 md:w-16 bg-gradient-to-l from-transparent to-athena-gold opacity-60" />
          </div>
          <p className="text-athena-text-muted text-sm">Configure your instance in a few steps</p>
        </div>

        {/* Step indicator */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] uppercase tracking-[0.25em] text-athena-text-dim">
            Step {step} of 3
          </p>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'bg-athena-gold'
                    : s < step
                      ? 'bg-athena-gold/40'
                      : 'bg-athena-border'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white/[0.02] border border-white/[0.06] rounded-2xl backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-6">
          <AnimatePresence mode="wait" initial={false}>
            {/* Step 1: Passphrase */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={direction === 'forward' ? 'enterFromRight' : 'enterFromLeft'}
                animate="center"
                exit={direction === 'forward' ? 'exitToLeft' : 'exitToRight'}
                variants={stepVariants}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-athena-gold/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-athena-gold" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif text-athena-gold">Set Your Passphrase</h2>
                    <p className="text-sm text-athena-text-muted">This is how you&apos;ll log in to Athena</p>
                  </div>
                </div>

                <div className="relative">
                  <input
                    ref={step1Ref}
                    type={showPass ? 'text' : 'password'}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Passphrase (8+ characters)"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-athena-text-muted hover:text-athena-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Confirm passphrase"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-athena-text-muted hover:text-athena-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passphrase && confirmPassphrase && passphrase !== confirmPassphrase && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400/80 text-xs tracking-wide"
                  >
                    Passphrases don&apos;t match
                  </motion.p>
                )}
                {passphrase && passphrase.length > 0 && passphrase.length < 8 && (
                  <p className="text-athena-text-dim text-xs tracking-wide">Must be at least 8 characters</p>
                )}

                <button
                  onClick={() => goToStep(2)}
                  disabled={!passphraseValid}
                  className="w-full flex items-center justify-center gap-2 bg-athena-gold hover:bg-athena-gold-bright text-athena-bg font-semibold py-3 min-h-[44px] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Step 2: Anthropic API Key */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={direction === 'forward' ? 'enterFromRight' : 'enterFromLeft'}
                animate="center"
                exit={direction === 'forward' ? 'exitToLeft' : 'exitToRight'}
                variants={stepVariants}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-athena-gold/10 flex items-center justify-center">
                    <Key className="w-4 h-4 text-athena-gold" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif text-athena-gold">Connect AI</h2>
                    <p className="text-sm text-athena-text-muted">Add your Anthropic API key for Claude</p>
                  </div>
                </div>

                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-athena-gold hover:text-athena-gold-bright transition-colors"
                >
                  Get an API key from console.anthropic.com <ExternalLink className="w-3 h-3" />
                </a>

                <div className="relative">
                  <input
                    ref={step2Ref}
                    type={showKey ? 'text' : 'password'}
                    value={anthropicKey}
                    onChange={(e) => {
                      setAnthropicKey(e.target.value);
                      setKeyValid(null);
                      setKeyError('');
                    }}
                    placeholder="sk-ant-..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-athena-text-muted hover:text-athena-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {anthropicKey && (
                  <button
                    onClick={testAnthropicKey}
                    disabled={testingKey}
                    className="flex items-center gap-2 text-sm px-4 min-h-[44px] rounded-xl bg-athena-panel border border-athena-border text-athena-text-primary hover:bg-white/[0.04] disabled:opacity-50 transition-colors"
                  >
                    {testingKey ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : keyValid ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : null}
                    {keyValid ? 'Connection verified' : 'Test Connection'}
                  </button>
                )}

                {keyError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400/80 text-xs tracking-wide"
                  >
                    {keyError}
                  </motion.p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => goToStep(1)}
                    className="px-4 min-h-[44px] rounded-xl border border-athena-border text-athena-text-muted hover:text-athena-text-primary transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => goToStep(3)}
                    className="flex-1 flex items-center justify-center gap-2 bg-athena-gold hover:bg-athena-gold-bright text-athena-bg font-semibold min-h-[44px] rounded-xl transition-all"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: WHOOP (Optional) */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={direction === 'forward' ? 'enterFromRight' : 'enterFromLeft'}
                animate="center"
                exit={direction === 'forward' ? 'exitToLeft' : 'exitToRight'}
                variants={stepVariants}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-athena-gold/10 flex items-center justify-center">
                    <Key className="w-4 h-4 text-athena-gold" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif text-athena-gold">Connect WHOOP</h2>
                    <p className="text-sm text-athena-text-muted">Optional — link your WHOOP account</p>
                  </div>
                </div>

                <a
                  href="https://developer.whoop.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-athena-gold hover:text-athena-gold-bright transition-colors"
                >
                  Get credentials from developer.whoop.com <ExternalLink className="w-3 h-3" />
                </a>

                <input
                  type="text"
                  value={whoopClientId}
                  onChange={(e) => setWhoopClientId(e.target.value)}
                  placeholder="Client ID"
                  className={inputClassNoToggle}
                />

                <input
                  type="password"
                  value={whoopClientSecret}
                  onChange={(e) => setWhoopClientSecret(e.target.value)}
                  placeholder="Client Secret"
                  className={inputClassNoToggle}
                />

                {globalError && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400/80 text-xs tracking-wide"
                  >
                    {globalError}
                  </motion.p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => goToStep(2)}
                    className="px-4 min-h-[44px] rounded-xl border border-athena-border text-athena-text-muted hover:text-athena-text-primary transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 bg-athena-gold hover:bg-athena-gold-bright text-athena-bg font-semibold min-h-[44px] rounded-xl disabled:opacity-50 transition-all"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {saving ? 'Setting up...' : 'Complete Setup'}
                  </button>
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 text-sm text-athena-text-muted hover:text-athena-text-primary min-h-[44px] transition-colors"
                >
                  <SkipForward className="w-4 h-4" /> Skip WHOOP — set up later
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
