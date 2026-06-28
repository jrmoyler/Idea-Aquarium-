// Environment / atmosphere for the Idea Aquarium.
//
// Everything here paints the WATER and TANK — the world the creatures live in,
// never the creatures themselves. The goal is a deep, living, cinematic
// underwater scene: light shafts filtering down, caustics rippling, bubbles
// rising from the bed, slow kelp swaying in the dark, sediment on the floor.
//
// Performance contract: static structure (ray definitions, kelp strands,
// bubble vents) is precomputed once via build* factories and only rebuilt on
// resize. Per-frame work is cheap arithmetic + a handful of gradients.

import { PALETTE, rgba } from "./color";
import { loopNoise, noise2D } from "./noise";

// ---------------------------------------------------------------------------
// Tunables — kept here so the whole mood can be dialed in one place.
// ---------------------------------------------------------------------------

/** Sea floor occupies this fraction of the bottom of the tank. */
export const FLOOR_FRACTION = 0.11;

// ---------------------------------------------------------------------------
// God rays / light shafts
// ---------------------------------------------------------------------------

export interface LightShaft {
  /** Horizontal origin at the surface, in 0..1 of width. */
  ox: number;
  /** Beam half-width at the surface, in 0..1 of width. */
  halfW: number;
  /** Lateral spread toward the bottom (beams fan out as they descend). */
  spread: number;
  /** Sway speed multiplier. */
  speed: number;
  /** Phase offset so beams breathe independently. */
  phase: number;
  /** Base brightness. */
  intensity: number;
  /** Cool teal vs warmer surface light. */
  warm: boolean;
}

export function buildLightShafts(): LightShaft[] {
  // A handful of broad shafts; few but soft reads as sunlight, not stripes.
  const defs: LightShaft[] = [
    { ox: 0.22, halfW: 0.05, spread: 0.06, speed: 0.9, phase: 0.0, intensity: 0.05, warm: false },
    { ox: 0.41, halfW: 0.08, spread: 0.1, speed: 0.6, phase: 1.7, intensity: 0.07, warm: false },
    { ox: 0.58, halfW: 0.04, spread: 0.05, speed: 1.2, phase: 3.1, intensity: 0.045, warm: true },
    { ox: 0.73, halfW: 0.09, spread: 0.12, speed: 0.5, phase: 4.6, intensity: 0.06, warm: false },
    { ox: 0.88, halfW: 0.05, spread: 0.07, speed: 1.0, phase: 5.9, intensity: 0.04, warm: true },
  ];
  return defs;
}

export function paintLightShafts(
  ctx: CanvasRenderingContext2D,
  shafts: LightShaft[],
  w: number,
  h: number,
  now: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = now * 0.001;
  // Shafts only reach into the upper ~70% — deep water swallows them.
  const reach = h * 0.78;
  for (const s of shafts) {
    const sway = Math.sin(t * s.speed + s.phase) * w * 0.05;
    const breathe = 0.7 + 0.3 * Math.sin(t * 0.6 * s.speed + s.phase * 1.3);
    const topX = s.ox * w + sway;
    const botX = topX + Math.sin(t * 0.4 * s.speed + s.phase) * s.spread * w;
    const topHalf = s.halfW * w;
    const botHalf = topHalf + s.spread * w * 1.6;

    const grad = ctx.createLinearGradient(0, -h * 0.05, 0, reach);
    const a = s.intensity * breathe;
    const color = s.warm ? PALETTE.amberGlow : PALETTE.tealGlow;
    grad.addColorStop(0, rgba(color, a));
    grad.addColorStop(0.35, rgba(color, a * 0.5));
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;

    // A slim trapezoid fanning toward the floor.
    ctx.beginPath();
    ctx.moveTo(topX - topHalf, -h * 0.05);
    ctx.lineTo(topX + topHalf, -h * 0.05);
    ctx.lineTo(botX + botHalf, reach);
    ctx.lineTo(botX - botHalf, reach);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Caustics — rippling refracted-light net on the upper water and floor.
// ---------------------------------------------------------------------------

export function paintCaustics(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = now * 0.0004;

  // Upper-water caustics: a coarse grid of soft glints driven by layered
  // sines + noise so the pattern shimmers and drifts without ever tiling.
  const cols = 7;
  const rows = 3;
  const bandTop = h * 0.02;
  const bandH = h * 0.34;
  const cellW = w / cols;
  const cellH = bandH / rows;
  for (let r = 0; r < rows; r++) {
    const depthFade = 1 - r / rows; // brightest near the surface
    for (let c = 0; c < cols; c++) {
      const wobX =
        Math.sin(t * 1.3 + c * 0.9 + r * 0.5) * cellW * 0.4 +
        noise2D(c * 0.7 + t, r * 0.7) * cellW * 0.3;
      const wobY = Math.cos(t * 1.1 + r * 1.2 + c * 0.4) * cellH * 0.3;
      const cx = c * cellW + cellW * 0.5 + wobX;
      const cy = bandTop + r * cellH + cellH * 0.5 + wobY;
      const flick = 0.5 + 0.5 * Math.sin(t * 3 + c * 1.7 + r * 2.3);
      const rad = cellW * (0.34 + flick * 0.18);
      const a = 0.035 * depthFade * (0.5 + flick * 0.5);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, rgba(PALETTE.tealGlow, a));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Faint floor caustics — the same net, dimmer, projected onto the bed.
  const floorY = h * (1 - FLOOR_FRACTION);
  const fCols = 6;
  const fCellW = w / fCols;
  for (let c = 0; c < fCols; c++) {
    const wob = Math.sin(t * 0.9 + c * 1.4) * fCellW * 0.35;
    const cx = c * fCellW + fCellW * 0.5 + wob;
    const cy = floorY + h * 0.02 + Math.sin(t + c) * h * 0.01;
    const flick = 0.5 + 0.5 * Math.sin(t * 2.4 + c * 1.1);
    const rad = fCellW * 0.5;
    const a = 0.018 * (0.4 + flick * 0.6);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, rgba(PALETTE.amberGlow, a));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Thermocline / haze banding — slow horizontal water-column striations.
// ---------------------------------------------------------------------------

export function paintThermocline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = now * 0.00012;
  const bands = 3;
  for (let i = 0; i < bands; i++) {
    const base = 0.32 + i * 0.2;
    const drift = Math.sin(t * (1 + i * 0.3) + i * 2.1) * 0.04;
    const cy = h * (base + drift);
    const thickness = h * (0.06 + i * 0.015);
    const a = 0.012 + i * 0.004;
    const g = ctx.createLinearGradient(0, cy - thickness, 0, cy + thickness);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, rgba(PALETTE.teal, a));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, cy - thickness, w, thickness * 2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Rising bubbles
// ---------------------------------------------------------------------------

export interface Bubble {
  vent: number; // index of source vent
  x: number;
  y: number;
  r: number;
  wobPhase: number;
  wobAmp: number;
  speed: number;
  life: number; // 0..1 fade-in then steady
}

export interface BubbleVent {
  x: number; // 0..1 of width
  /** Average frames between emissions (scaled by dt). */
  interval: number;
  cooldown: number;
  intensity: number;
}

export function buildBubbleVents(): BubbleVent[] {
  return [
    { x: 0.18, interval: 22, cooldown: Math.random() * 22, intensity: 1 },
    { x: 0.47, interval: 40, cooldown: Math.random() * 40, intensity: 0.7 },
    { x: 0.69, interval: 16, cooldown: Math.random() * 16, intensity: 1.2 },
    { x: 0.86, interval: 52, cooldown: Math.random() * 52, intensity: 0.6 },
  ];
}

/** Advance & emit bubbles, then draw them. Mutates `bubbles` in place. */
export function updateAndPaintBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: Bubble[],
  vents: BubbleVent[],
  w: number,
  h: number,
  now: number,
  dt: number,
) {
  const floorY = h * (1 - FLOOR_FRACTION);

  // Emit from vents on their own cadence.
  for (let v = 0; v < vents.length; v++) {
    const vent = vents[v];
    vent.cooldown -= dt;
    if (vent.cooldown <= 0 && bubbles.length < 90) {
      vent.cooldown = vent.interval * (0.6 + Math.random() * 0.8);
      const r = 0.8 + Math.random() * 2.2 * vent.intensity;
      bubbles.push({
        vent: v,
        x: vent.x * w + (Math.random() - 0.5) * 10,
        y: floorY + 2 + Math.random() * 6,
        r,
        wobPhase: Math.random() * Math.PI * 2,
        wobAmp: 0.6 + Math.random() * 1.6,
        speed: (0.5 + Math.random() * 0.7) * (0.8 + r * 0.15),
        life: 0,
      });
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = now * 0.004;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.life = Math.min(1, b.life + 0.05 * dt);
    b.y -= b.speed * dt;
    b.x += Math.sin(t * 1.2 + b.wobPhase) * b.wobAmp * 0.12 * dt;
    // Bubbles dissolve before reaching the very top.
    const topLimit = h * (0.08 + (b.vent % 2) * 0.06);
    if (b.y < topLimit) {
      bubbles.splice(i, 1);
      continue;
    }
    const fadeTop = Math.min(1, (b.y - topLimit) / (h * 0.25));
    const a = 0.22 * b.life * fadeTop;

    // Soft body.
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
    g.addColorStop(0, rgba(PALETTE.tealGlow, a * 0.5));
    g.addColorStop(0.6, rgba(PALETTE.teal, a * 0.25));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 2, 0, Math.PI * 2);
    ctx.fill();

    // Tiny highlight rim so it reads as a bubble, not a dot.
    if (b.r > 1.1) {
      ctx.strokeStyle = rgba("#FFFFFF", a * 0.6);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, Math.PI * 0.9, Math.PI * 1.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Sea floor / substrate
// ---------------------------------------------------------------------------

export interface Sediment {
  x: number; // 0..1
  y: number; // 0..1 within floor band
  r: number;
  warm: boolean;
  twinkle: number;
}

export function buildSediment(count = 46): Sediment[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.4 + Math.random() * 1.3,
    warm: Math.random() < 0.35,
    twinkle: Math.random() * Math.PI * 2,
  }));
}

export function paintSeaFloor(
  ctx: CanvasRenderingContext2D,
  sediment: Sediment[],
  w: number,
  h: number,
  now: number,
) {
  const floorTop = h * (1 - FLOOR_FRACTION);
  const t = now * 0.001;

  ctx.save();

  // Darker bed with a gentle uneven contour along its upper edge.
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, floorTop);
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const px = (i / steps) * w;
    // Smooth dune contour, very slowly breathing.
    const n =
      noise2D(i * 0.35, 11.3) * 0.6 + noise2D(i * 0.13 + t * 0.05, 4.1) * 0.4;
    const py = floorTop + n * h * 0.025 - h * 0.012;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(w, h);
  ctx.closePath();

  const bed = ctx.createLinearGradient(0, floorTop - h * 0.04, 0, h);
  bed.addColorStop(0, "rgba(0,0,0,0)");
  bed.addColorStop(0.4, rgba(PALETTE.navyDeep, 0.55));
  bed.addColorStop(1, rgba("#01030A", 0.92));
  ctx.fillStyle = bed;
  ctx.fill();

  // Faint warm glow seeping from the bed.
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createLinearGradient(0, floorTop, 0, h);
  glow.addColorStop(0, rgba(PALETTE.amber, 0.04));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, floorTop, w, h - floorTop);

  // Sediment / glow scatter resting on the bed.
  const floorH = h - floorTop;
  for (const s of sediment) {
    const px = s.x * w;
    const py = floorTop + s.y * floorH * 0.85 + floorH * 0.1;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + s.twinkle);
    const a = (0.06 + tw * 0.07) * (0.5 + s.y * 0.5);
    const color = s.warm ? PALETTE.amberGlow : PALETTE.tealGlow;
    const g = ctx.createRadialGradient(px, py, 0, px, py, s.r * 2.6);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, s.r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Background flora — tall, slow-swaying kelp/coral silhouettes.
// ---------------------------------------------------------------------------

export interface KelpStrand {
  x: number; // 0..1 anchor
  height: number; // 0..1 of tank height
  width: number; // base width px
  segs: number;
  swaySpeed: number;
  swayAmp: number; // px lateral at the tip
  phase: number;
  seed: number;
  warm: boolean;
  blades: number; // small leaflets along the stalk
}

export function buildKelp(count = 7): KelpStrand[] {
  return Array.from({ length: count }, (_, i) => {
    const warm = Math.random() < 0.25;
    return {
      // Spread strands across the width, biased to the sides so the center
      // (where creatures live) stays clear.
      x: 0.04 + (i / Math.max(1, count - 1)) * 0.92 + (Math.random() - 0.5) * 0.04,
      height: 0.28 + Math.random() * 0.34,
      width: 5 + Math.random() * 7,
      segs: 9,
      swaySpeed: 0.3 + Math.random() * 0.4,
      swayAmp: 14 + Math.random() * 26,
      phase: Math.random() * Math.PI * 2,
      seed: Math.random() * 100,
      warm,
      blades: 3 + Math.floor(Math.random() * 4),
    };
  });
}

export function paintKelp(
  ctx: CanvasRenderingContext2D,
  strands: KelpStrand[],
  w: number,
  h: number,
  now: number,
) {
  const floorTop = h * (1 - FLOOR_FRACTION);
  const t = now * 0.001;

  ctx.save();
  // Very dark, low-contrast — these read as background depth, not clutter.
  for (const k of strands) {
    const baseX = k.x * w;
    const totalH = k.height * h;
    const tipY = floorTop - totalH;
    const color = k.warm ? PALETTE.amber : PALETTE.slate;

    // Build the spine as a smooth swaying curve sampled with loop noise.
    const pts: { x: number; y: number; wob: number }[] = [];
    for (let s = 0; s <= k.segs; s++) {
      const f = s / k.segs; // 0 at base, 1 at tip
      const y = floorTop - f * totalH;
      // Sway grows toward the tip; noise gives an organic, non-sinusoidal bend.
      const wob =
        (Math.sin(t * k.swaySpeed + k.phase + f * 2.2) +
          loopNoise(f * 3 + k.phase, t * 0.6, k.seed, 2) * 0.6) *
        k.swayAmp *
        Math.pow(f, 1.6);
      pts.push({ x: baseX + wob, y, wob });
    }

    // Stalk: tapering filled ribbon.
    ctx.beginPath();
    // up the left edge
    for (let s = 0; s <= k.segs; s++) {
      const f = s / k.segs;
      const halfW = (k.width * (1 - f * 0.8)) / 2;
      const p = pts[s];
      const x = p.x - halfW;
      if (s === 0) ctx.moveTo(x, p.y);
      else ctx.lineTo(x, p.y);
    }
    // down the right edge
    for (let s = k.segs; s >= 0; s--) {
      const f = s / k.segs;
      const halfW = (k.width * (1 - f * 0.8)) / 2;
      const p = pts[s];
      ctx.lineTo(p.x + halfW, p.y);
    }
    ctx.closePath();

    const grad = ctx.createLinearGradient(baseX, floorTop, baseX, tipY);
    grad.addColorStop(0, rgba(PALETTE.navyDeep, 0.85));
    grad.addColorStop(0.5, rgba(color, 0.12));
    grad.addColorStop(1, rgba(color, 0.05));
    ctx.fillStyle = grad;
    ctx.fill();

    // Small blades/leaflets catching faint light along the upper stalk.
    ctx.globalCompositeOperation = "lighter";
    for (let bI = 0; bI < k.blades; bI++) {
      const f = 0.35 + (bI / k.blades) * 0.6;
      const idx = Math.min(k.segs, Math.round(f * k.segs));
      const p = pts[idx];
      const side = bI % 2 === 0 ? 1 : -1;
      const bladeLen = k.swayAmp * 0.5 + 8;
      const tipX = p.x + side * bladeLen * (0.6 + 0.4 * Math.sin(t + bI));
      const tipBy = p.y - bladeLen * 0.4;
      const g = ctx.createLinearGradient(p.x, p.y, tipX, tipBy);
      g.addColorStop(0, rgba(color, 0.1));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + side * bladeLen * 0.6, p.y - bladeLen * 0.1, tipX, tipBy);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Foreground depth-of-field murk — an occasional very faint drifting haze so
// the water reads as thick. Two large slow blobs, additive but near-invisible.
// ---------------------------------------------------------------------------

export function paintMurk(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const t = now * 0.00009;
  for (let i = 0; i < 2; i++) {
    const phase = i * 3.3;
    // Murk swells and recedes, sometimes nearly absent.
    const pulse = Math.max(0, Math.sin(t * 2 + phase));
    if (pulse < 0.02) continue;
    const cx = w * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.3 + phase)));
    const cy = h * (0.4 + 0.3 * Math.sin(t * 0.9 + phase * 1.7));
    const rad = Math.max(w, h) * (0.4 + i * 0.15);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, rgba(PALETTE.slate, 0.02 * pulse));
    g.addColorStop(0.6, rgba(PALETTE.slate, 0.008 * pulse));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
