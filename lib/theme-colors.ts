export interface AccentPalette {
  id: string;
  label: string;
  DEFAULT: string;
  bright: string;
  pale: string;
  rose: string;
  dim: string;
}

export const ACCENT_PALETTES: AccentPalette[] = [
  {
    id: "gold",
    label: "Athena",
    DEFAULT: "#FACC15",
    bright: "#FEF08A",
    pale: "#e8d5a0",
    rose: "#c9956b",
    dim: "#CA8A04",
  },
  {
    id: "ocean",
    label: "Zeus",
    DEFAULT: "#38BDF8",
    bright: "#7DD3FC",
    pale: "#BAE6FD",
    rose: "#0EA5E9",
    dim: "#0369A1",
  },
  {
    id: "purple",
    label: "Dionysus",
    DEFAULT: "#A78BFA",
    bright: "#C4B5FD",
    pale: "#DDD6FE",
    rose: "#8B5CF6",
    dim: "#6D28D9",
  },
  {
    id: "emerald",
    label: "Artemis",
    DEFAULT: "#34D399",
    bright: "#6EE7B7",
    pale: "#A7F3D0",
    rose: "#10B981",
    dim: "#047857",
  },
  {
    id: "rose",
    label: "Ares",
    DEFAULT: "#FB7185",
    bright: "#FDA4AF",
    pale: "#FECDD3",
    rose: "#F43F5E",
    dim: "#BE123C",
  },
  {
    id: "copper",
    label: "Hephaestus",
    DEFAULT: "#F59E0B",
    bright: "#FCD34D",
    pale: "#FDE68A",
    rose: "#D97706",
    dim: "#92400E",
  },
  {
    id: "frost",
    label: "Poseidon",
    DEFAULT: "#22D3EE",
    bright: "#67E8F9",
    pale: "#A5F3FC",
    rose: "#06B6D4",
    dim: "#0E7490",
  },
  {
    id: "silver",
    label: "Hermes",
    DEFAULT: "#94A3B8",
    bright: "#CBD5E1",
    pale: "#E2E8F0",
    rose: "#64748B",
    dim: "#475569",
  },
];

export const DEFAULT_ACCENT_ID = "gold";

export function getPaletteById(id: string): AccentPalette {
  return ACCENT_PALETTES.find((p) => p.id === id) ?? ACCENT_PALETTES[0];
}
