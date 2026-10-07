import tailwindcssAnimate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
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
      colors: {
        neutral: {
          50: "hsl(var(--neutral-50, 0 0% 98%) / <alpha-value>)",
          100: "hsl(var(--neutral-100, 0 0% 98%) / <alpha-value>)",
          200: "hsl(var(--neutral-200, 240 5.9% 90%) / <alpha-value>)",
          300: "hsl(var(--neutral-300, 240 4.9% 83.9%) / <alpha-value>)",
          400: "hsl(var(--neutral-400, 240 5% 64.9%) / <alpha-value>)",
          500: "hsl(var(--neutral-500, 240 3.8% 46.1%) / <alpha-value>)",
          600: "hsl(var(--neutral-600, 240 5.2% 33.9%) / <alpha-value>)",
          700: "hsl(var(--neutral-700, 240 5.3% 26.1%) / <alpha-value>)",
          800: "hsl(var(--neutral-800, 240 3.7% 15.9%) / <alpha-value>)",
          900: "hsl(var(--neutral-900, 240 5.9% 10%) / <alpha-value>)",
          950: "hsl(var(--neutral-950, 240 10% 3.9%) / <alpha-value>)",
        },
        emerald: {
          50: "hsl(var(--accent-50, 152 76% 96%) / <alpha-value>)",
          100: "hsl(var(--accent-100, 149 80% 90%) / <alpha-value>)",
          200: "hsl(var(--accent-200, 152 76% 80%) / <alpha-value>)",
          300: "hsl(var(--accent-300, 156 72% 67%) / <alpha-value>)",
          400: "hsl(var(--accent-400, 158 64% 52%) / <alpha-value>)",
          500: "hsl(var(--accent-500, 160 84% 39%) / <alpha-value>)",
          600: "hsl(var(--accent-600, 161 94% 30%) / <alpha-value>)",
          700: "hsl(var(--accent-700, 163 94% 24%) / <alpha-value>)",
          800: "hsl(var(--accent-800, 163 88% 20%) / <alpha-value>)",
          900: "hsl(var(--accent-900, 164 86% 16%) / <alpha-value>)",
          950: "hsl(var(--accent-950, 166 91% 9%) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
