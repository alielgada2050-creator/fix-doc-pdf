/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  corePlugins: { preflight: false },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--sh-border))",
        input: "hsl(var(--sh-input))",
        ring: "hsl(var(--sh-ring))",
        background: "hsl(var(--sh-background))",
        foreground: "hsl(var(--sh-foreground))",
        primary: {
          DEFAULT: "hsl(var(--sh-primary))",
          foreground: "hsl(var(--sh-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--sh-secondary))",
          foreground: "hsl(var(--sh-secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--sh-destructive))",
          foreground: "hsl(var(--sh-destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--sh-muted))",
          foreground: "hsl(var(--sh-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--sh-accent))",
          foreground: "hsl(var(--sh-accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--sh-popover))",
          foreground: "hsl(var(--sh-popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--sh-card))",
          foreground: "hsl(var(--sh-card-foreground))",
        },
      },
      fontFamily: { ui: ["Readex Pro","IBM Plex Sans Arabic","system-ui","sans-serif"], brand: ["Alexandria","Readex Pro","system-ui","sans-serif"] },
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
