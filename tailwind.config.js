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
