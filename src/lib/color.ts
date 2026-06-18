// Color helpers for the simulation. Kept dependency-free so the canvas layer
// stays fast and predictable.

export const PALETTE = {
  navy: "#050A18",
  navyDeep: "#03060F",
  teal: "#00D9B5",
  tealGlow: "#1EF5D2",
  amber: "#D4A843",
  amberGlow: "#F0C766",
  slate: "#5A6A87",
  ink: "#8FA0BF",
} as const;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parse a #hex or rgb()/rgba() string into RGB components. */
export function parseRgb(color: string): RGB {
  if (color.startsWith("#")) {
    const clean = color.slice(1);
    const full =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = color.match(/-?\d+\.?\d*/g);
  if (m && m.length >= 3) {
    return { r: +m[0], g: +m[1], b: +m[2] };
  }
  return { r: 0, g: 0, b: 0 };
}

export function hexToRgb(hex: string): RGB {
  return parseRgb(hex);
}

function toHex(n: number): string {
  return Math.round(clamp01(n / 255) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Build an rgba() string from any color input + alpha. */
export function rgba(color: string, alpha: number): string {
  const { r, g, b } = parseRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

/** Linear interpolation between two colors, returns a hex string. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  const k = clamp01(t);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

/** Lighten a color toward white by amount 0..1, returns hex. */
export function lighten(color: string, amount: number): string {
  return mixHex(color, "#FFFFFF", amount);
}

/**
 * Map an idea toward a hue identity: teal for "builder/infra" energy,
 * amber for "revenue/heat" energy. Revenue pulls the body warmer.
 */
export function ideaBaseColor(revenue: number): string {
  // revenue 0 -> teal, 100 -> amber, with a cool midpoint.
  return mixHex(PALETTE.teal, PALETTE.amber, Math.pow(revenue / 100, 1.25));
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
