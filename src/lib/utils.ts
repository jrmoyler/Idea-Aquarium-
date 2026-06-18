import type { FilterKey, Idea } from "../types";

/** Numeric clamp. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deterministic pseudo-random generator (mulberry32). Seeding keeps the
 * ecosystem layout intentional and reproducible across reloads.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a stable 32-bit-ish integer seed. */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Whether an idea matches a given filter chip. */
export function matchesFilter(idea: Idea, key: FilterKey): boolean {
  switch (key) {
    case "highSynergy":
      return idea.synergy >= 75;
    case "fastToBuild":
      // Lower complexity + higher momentum = faster to ship.
      return idea.complexity <= 60 && idea.momentum >= 60;
    case "weird":
      return idea.novelty >= 80 || idea.tags.includes("weird");
    case "monetizable":
      return idea.revenue >= 70 || idea.tags.includes("monetizable");
    case "dormant":
      return idea.status === "dormant";
    default: {
      // Exhaustiveness guard: new filter keys must be handled above.
      const _never: never = key;
      return _never;
    }
  }
}

/** True if the idea passes a free-text search across name, species, tags. */
export function matchesQuery(idea: Idea, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    idea.name.toLowerCase().includes(q) ||
    idea.species.toLowerCase().includes(q) ||
    idea.description.toLowerCase().includes(q) ||
    idea.tags.some((t) => t.toLowerCase().includes(q))
  );
}

/** Format a 0..100 trait as a tidy label. */
export function traitLabel(v: number): string {
  if (v >= 85) return "Exceptional";
  if (v >= 70) return "Strong";
  if (v >= 50) return "Moderate";
  if (v >= 30) return "Emerging";
  return "Latent";
}
