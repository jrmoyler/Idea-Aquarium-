/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core brand palette
        navy: {
          DEFAULT: "#eaf8ff",
          950: "#d5efff",
          900: "#eaf8ff",
          850: "#dff5ff",
          800: "#cceefe",
          700: "#b8e7fd",
        },
        teal: {
          DEFAULT: "#06B6D4",
          glow: "#22D3EE",
          dim: "#0E7490",
        },
        amber: {
          DEFAULT: "#F59E0B",
          glow: "#FACC15",
          dim: "#B45309",
        },
        slate: {
          ink: "#334155",
          mute: "#64748B",
          line: "#c6def0",
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
        panel: "0 24px 60px -30px rgba(0, 0, 0, 0.9)",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 3.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
