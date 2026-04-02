'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import type { DataMaturity, FeatureKey } from '@/lib/data-maturity'
import { isFeatureUnlocked, daysUntilUnlock, fetchDataMaturity, FEATURE_THRESHOLDS } from '@/lib/data-maturity'

const DataMaturityContext = createContext<DataMaturity | null>(null)

export function DataMaturityProvider({ children }: { children: React.ReactNode }) {
  const [maturity, setMaturity] = useState<DataMaturity | null>(null)

  useEffect(() => {
    fetchDataMaturity()
      .then(setMaturity)
      .catch(() => {
        // If fetch fails, leave null — gates will show children (unlocked assumption)
      })
  }, [])

  return (
    <DataMaturityContext.Provider value={maturity}>
      {children}
    </DataMaturityContext.Provider>
  )
}

export function useDataMaturity(): DataMaturity | null {
  return useContext(DataMaturityContext)
}

interface DataGateProps {
  feature: FeatureKey
  children: React.ReactNode
  label?: string
  compact?: boolean
  className?: string
}

export function DataGate({ feature, children, label, compact, className }: DataGateProps) {
  const maturity = useDataMaturity()

  // If maturity not loaded yet, show children (assume unlocked to avoid flash)
  if (!maturity) return <>{children}</>

  if (isFeatureUnlocked(maturity, feature)) return <>{children}</>

  const remaining = daysUntilUnlock(maturity, feature)
  const threshold = FEATURE_THRESHOLDS[feature]
  const featureLabel = label || threshold.label
  const description = threshold.description

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'rgb(var(--athena-gold-dim))',
          fontFamily: 'var(--font-manrope), sans-serif',
          fontWeight: 500,
          letterSpacing: '0.02em',
          padding: '8px 12px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(50,44,34,0.4)',
        }}
      >
        <Lock size={12} style={{ opacity: 0.7 }} />
        <span>
          <span style={{ color: 'rgb(var(--athena-gold-pale))' }}>{featureLabel}</span>
          {' '}unlocks in {remaining} day{remaining !== 1 ? 's' : ''}
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={className}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(50,44,34,0.5)',
        borderRadius: 12,
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '32px 24px',
      }}
    >
      <Lock
        size={24}
        strokeWidth={1.5}
        style={{
          color: 'rgb(var(--athena-gold-dim))',
          filter: 'drop-shadow(0 0 8px rgba(193,167,110,0.15))',
        }}
      />
      <div
        style={{
          fontSize: 14,
          color: 'rgb(var(--athena-gold-pale))',
          fontFamily: 'var(--font-playfair), serif',
          fontWeight: 500,
          textAlign: 'center',
        }}
      >
        {featureLabel} unlocks in {remaining} day{remaining !== 1 ? 's' : ''}
      </div>
      {description && (
        <div
          style={{
            fontSize: 12,
            color: '#8a8070',
            fontFamily: 'var(--font-manrope), sans-serif',
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 300,
          }}
        >
          {description}
        </div>
      )}
      <div
        style={{
          fontSize: 10,
          color: '#4a4238',
          fontFamily: 'var(--font-manrope), sans-serif',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        Keep using Athena daily to unlock
      </div>
    </motion.div>
  )
}
