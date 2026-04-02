
import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./pages/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./src/**/*.{ts,tsx}",
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            fontFamily: {
                sans: ['var(--font-manrope)', 'Inter', 'system-ui', 'sans-serif'],
                serif: ['var(--font-playfair)', 'serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                success: {
                    DEFAULT: "hsl(var(--success))",
                    foreground: "hsl(var(--success-foreground))",
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))",
                },
                // Today 2.0 Colors
                athena: {
                    bg: "#020204",
                    panel: "rgba(14,12,10,0.9)",
                    border: "rgba(50,44,34,0.5)",
                    text: {
                        primary: "#ede8df",
                        warm: "#c8bea8",
                        muted: "#7a7060",
                        dim: "#4a4238",
                    },
                    gold: {
                        DEFAULT: "rgb(var(--athena-gold) / <alpha-value>)",
                        bright: "rgb(var(--athena-gold-bright) / <alpha-value>)",
                        pale: "rgb(var(--athena-gold-pale) / <alpha-value>)",
                        rose: "rgb(var(--athena-gold-rose) / <alpha-value>)",
                        dim: "rgb(var(--athena-gold-dim) / <alpha-value>)",
                    },
                    green: "rgb(74 222 128 / <alpha-value>)", // Vibrant Green - fixed, used for recovery
                    red: "rgb(239 68 68 / <alpha-value>)", // Vibrant Red - fixed
                    purple: "rgb(168 85 247 / <alpha-value>)", // Vibrant Purple - fixed, used for sleep
                    strain: "rgb(217 164 100 / <alpha-value>)", // Warm brown - fixed, used for strain
                },
                glass: {
                    DEFAULT: "hsl(var(--glass))",
                    border: "hsl(var(--glass-border))",
                },
                glow: {
                    primary: "hsl(var(--glow-primary))",
                    accent: "hsl(var(--glow-accent))",
                },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar-background))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                "fade-in": {
                    "0%": { opacity: "0", transform: "translateY(10px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
                "fade-out": {
                    "0%": { opacity: "1", transform: "translateY(0)" },
                    "100%": { opacity: "0", transform: "translateY(10px)" },
                },
                "scale-in": {
                    "0%": { transform: "scale(0.95)", opacity: "0" },
                    "100%": { transform: "scale(1)", opacity: "1" },
                },
                shimmer: {
                    "0%": { backgroundPosition: "-200% 0" },
                    "100%": { backgroundPosition: "200% 0" },
                },
                float: {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "fade-in": "fade-in 0.3s ease-out forwards",
                "fade-out": "fade-out 0.3s ease-out forwards",
                "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                shimmer: "shimmer 2s infinite linear",
                float: "float 3s ease-in-out infinite",
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-mesh': 'linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, transparent 50%, hsl(var(--accent) / 0.1) 100%)',
            },
        },
    },
    plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
export default config;
