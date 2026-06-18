/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core brand palette
        navy: {
          DEFAULT: "#050A18",
          950: "#03060F",
          900: "#050A18",
          850: "#070E22",
          800: "#0A1430",
          700: "#0F1C42",
        },
        teal: {
          DEFAULT: "#00D9B5",
          glow: "#1EF5D2",
          dim: "#0B8A78",
        },
        amber: {
          DEFAULT: "#D4A843",
          glow: "#F0C766",
          dim: "#8A6E2C",
        },
        slate: {
          ink: "#8FA0BF",
          mute: "#5A6A87",
          line: "#16223F",
        },
      },
      fontFamily: {
        grotesk: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"Space Grotesk"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        widest2: "0.28em",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(0, 217, 181, 0.35)",
        panel: "0 24px 60px -30px rgba(0, 0, 0, 0.9)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(143,160,191,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(143,160,191,0.05) 1px, transparent 1px)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 3.2s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease forwards",
      },
    },
  },
  plugins: [],
};
