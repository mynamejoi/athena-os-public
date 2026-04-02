"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { AccentPalette, DEFAULT_ACCENT_ID, getPaletteById } from "@/lib/theme-colors";

const STORAGE_KEY = "athena-accent-color";

interface ThemeColorContextValue {
  accentId: string;
  accent: AccentPalette;
  setAccentColor: (id: string) => void;
}

const ThemeColorContext = createContext<ThemeColorContextValue | null>(null);

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

function applyPalette(palette: AccentPalette) {
  const root = document.documentElement.style;
  root.setProperty("--athena-gold", hexToRgb(palette.DEFAULT));
  root.setProperty("--athena-gold-bright", hexToRgb(palette.bright));
  root.setProperty("--athena-gold-pale", hexToRgb(palette.pale));
  root.setProperty("--athena-gold-rose", hexToRgb(palette.rose));
  root.setProperty("--athena-gold-dim", hexToRgb(palette.dim));
  // Aura gradient on body
  const rgb = hexToRgb(palette.DEFAULT);
  document.body.style.backgroundImage = `radial-gradient(ellipse 80% 50% at 50% 50%, rgba(${rgb.replace(/ /g, ",")},0.06) 0%, transparent 70%)`;
  document.body.style.backgroundAttachment = "fixed";
}

export function ThemeColorProvider({ children }: { children: React.ReactNode }) {
  const [accentId, setAccentId] = useState(DEFAULT_ACCENT_ID);

  // Read from localStorage on mount, always apply aura
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const id = saved || DEFAULT_ACCENT_ID;
    if (saved) setAccentId(saved);
    applyPalette(getPaletteById(id));
  }, []);

  const setAccentColor = (id: string) => {
    setAccentId(id);
    const palette = getPaletteById(id);
    applyPalette(palette);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const accent = getPaletteById(accentId);

  return (
    <ThemeColorContext.Provider value={{ accentId, accent, setAccentColor }}>
      {children}
    </ThemeColorContext.Provider>
  );
}

export function useThemeColor() {
  const ctx = useContext(ThemeColorContext);
  if (!ctx) throw new Error("useThemeColor must be used within ThemeColorProvider");
  return ctx;
}
