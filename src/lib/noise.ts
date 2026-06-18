// Cheap, dependency-free value noise used to make organism bodies breathe,
// deform, and drift irregularly. Everything here is smooth and continuous so
// edges never read as crisp geometry — the goal is grown, not drawn.

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic hash -> [0,1). Stable per integer lattice point. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** 1D value noise in [-1, 1]. */
export function noise1D(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = fade(f);
  return mix(hash(i), hash(i + 1), u) * 2 - 1;
}

/** 2D value noise in [-1, 1]. */
export function noise2D(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const aa = hash(xi + yi * 57.0);
  const ba = hash(xi + 1 + yi * 57.0);
  const ab = hash(xi + (yi + 1) * 57.0);
  const bb = hash(xi + 1 + (yi + 1) * 57.0);
  return (mix(mix(aa, ba, u), mix(ab, bb, u), v)) * 2 - 1;
}

/** Fractal (layered) 1D noise, [-1, 1]. More octaves -> finer wrinkles. */
export function fbm1D(x: number, octaves = 3): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise1D(x * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / norm;
}

/**
 * Periodic angular noise: sampling around a closed loop (0..2π) returns a
 * value that wraps seamlessly, so deformed membranes never show a seam. Used
 * to wobble the silhouette of a body without it looking like a polygon.
 */
export function loopNoise(angle: number, t: number, seed: number, freq = 2): number {
  // Sample 2D noise along a circle of radius `freq`, advancing through time on
  // a third pseudo-axis folded into x/y via the seed.
  const nx = Math.cos(angle) * freq + seed * 13.13;
  const ny = Math.sin(angle) * freq + t;
  return noise2D(nx, ny);
}
