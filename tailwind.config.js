/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep "instrument tank" surfaces — cohesive with the dark canvas.
        navy: {
          DEFAULT: "#0a1622",
          950: "#060d16",
          900: "#0a1622",
          850: "#0e1c2b",
          800: "#132433",
          700: "#1b3146",
        },
        // Active-intelligence accent.
        teal: {
          DEFAULT: "#22d3c5",
          glow: "#5ff0e3",
          dim: "#0f8c83",
        },
        // Strategic weight (revenue / complexity).
        amber: {
          DEFAULT: "#f5c451",
          glow: "#ffdd8a",
          dim: "#b88a2a",
        },
        // Text + hairlines on dark surfaces.
        slate: {
          ink: "#c4d4e4",
          mute: "#7e93ad",
          line: "#23384f",
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
