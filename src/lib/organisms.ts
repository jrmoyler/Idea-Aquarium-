import type { Organism } from "./simulation";
import type { RenderProfile, Tendril } from "./organism-profile";
import { lighten, mixHex, PALETTE, rgba } from "./color";
import { clamp } from "./utils";
import { fbm1D, loopNoise } from "./noise";

// ---------------------------------------------------------------------------
// Biological organism renderer.
//
// Bodies are grown from soft deformed blobs, translucent membranes, internal
// bioluminescent gradients, and trailing filaments. Nothing here draws a clean
// circle, ring, polygon, or outline as a visual identity. Edges are diffused by
// gradient fade + shadow bloom; detail lives *inside* the membrane via clipping.
// ---------------------------------------------------------------------------

export interface OrganismEnv {
  now: number;
  dt: number;
  dimmed: boolean;
}

interface Pt {
  x: number;
  y: number;
}

/** Public entry: draw one organism (body + appendages + internal glow). */
export function drawOrganism(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  env: OrganismEnv,
) {
  const t = env.now * 0.001;
  const dormant = o.idea.status === "dormant";
  const dormantDim = dormant ? 0.5 : 1;
  const baseAlpha = (env.dimmed ? 0.14 : 1) * o.presence * dormantDim;
  if (baseAlpha <= 0.015) return;

  const hover = o.hover;
  const focus = o.selectGlow;
  const resonance = Math.max(o.resonance, o.mergeGlow);

  // Living responses to attention: tighten on notice, glow brighter when
  // selected, flush warm during merge resonance.
  const glow = 1 + hover * 0.45 + focus * 0.9 + resonance * 0.85;
  const tighten = hover * 0.14 + focus * 0.05;
  const limbAlpha = baseAlpha * (0.7 + focus * 0.4 + hover * 0.2);

  const r = o.radius * (1 + Math.sin(o.pulsePhase) * 0.03 * o.joyFactor);

  // Body hue: warmer (amber) with revenue; resonance pushes warmer still.
  const warmth = clamp(o.profile.warmth + resonance * 0.35, 0, 1);
  const bodyColor = mixHex(o.baseColor, PALETTE.amber, warmth * 0.35);
  const glowColor = mixHex(PALETTE.tealGlow, PALETTE.amberGlow, warmth * 0.7);

  ctx.save();
  ctx.translate(o.x, o.y);

  // Soft outer bloom — bioluminescence leaking into the water. Embedded-feeling
  // (anchored to the body), low alpha, large radius. Not an outline ring.
  paintBloom(ctx, r, glowColor, baseAlpha * (0.16 + focus * 0.16 + resonance * 0.2) * o.joyFactor + baseAlpha * 0.05);

  ctx.save();
  ctx.rotate(o.heading);

  switch (o.archetype) {
    case "drifter":
      drawDrifter(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten);
      break;
    case "swarmer":
      drawSwarmer(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten);
      break;
    case "floater":
      drawFloater(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten);
      break;
    case "hunter":
      drawHunter(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten);
      break;
    case "colonial":
      drawColonial(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten);
      break;
    default: {
      const _never: never = o.archetype;
      return _never;
    }
  }

  ctx.restore(); // heading
  ctx.restore(); // translate
}

// ---------------------------------------------------------------------------
// Body silhouette generation
// ---------------------------------------------------------------------------

interface BodyShape {
  rBase: number;
  elong: number; // x-scale along heading
  squash: number; // y-scale across heading
  frontFull: number; // >1 rounds the leading edge (+x)
  backTaper: number; // <1 tapers the trailing edge (-x)
  contractAmt: number; // how much the muscular pulse reshapes the body
}

/** Sample an irregular, breathing, asymmetric closed outline (local frame). */
function bodyPoints(
  p: RenderProfile,
  o: Organism,
  t: number,
  shape: BodyShape,
  tighten: number,
): Pt[] {
  const N = 60;
  const pts: Pt[] = [];
  // Contraction squeezes laterally and jets the body forward a touch.
  const c = o.contraction * shape.contractAmt + tighten;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    let rad =
      1 +
      p.lobeAmp * Math.sin(a * p.lobeFreqA + p.lobePhaseA) +
      p.lobeAmp * 0.55 * Math.sin(a * p.lobeFreqB + p.lobePhaseB + t * 0.5) +
      loopNoise(a, t * 0.25, p.jitterSeed, 2) * p.lobeAmp * 0.8;
    // Directional fullness — one flank carries more mass than the other.
    rad += p.asym * Math.cos(a - 0.6);

    const fb = Math.cos(a); // +1 leading edge, -1 trailing edge
    if (fb > 0) rad *= 1 + (shape.frontFull - 1) * fb;
    else rad *= 1 + (shape.backTaper - 1) * -fb;

    rad = Math.max(0.05, rad) * shape.rBase;

    const x = Math.cos(a) * rad * shape.elong * (1 + c * 0.22);
    const y = Math.sin(a) * rad * shape.squash * (1 - c * 0.3);
    pts.push({ x, y });
  }
  return pts;
}

/** Smooth closed path through points using quadratic midpoint interpolation. */
function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length;
  ctx.beginPath();
  const startX = (pts[n - 1].x + pts[0].x) / 2;
  const startY = (pts[n - 1].y + pts[0].y) / 2;
  ctx.moveTo(startX, startY);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Membrane + internal anatomy (shared by all archetypes)
// ---------------------------------------------------------------------------

function paintBloom(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.6);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.5, rgba(color, alpha * 0.3));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Translucent flesh with a soft, diffused edge (no stroked outline). */
function paintMembrane(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  r: number,
  color: string,
  alpha: number,
  lightOffset: Pt,
) {
  ctx.save();
  ctx.shadowColor = rgba(color, 0.4 * alpha);
  ctx.shadowBlur = r * 0.45;
  tracePath(ctx, pts);
  const g = ctx.createRadialGradient(
    lightOffset.x,
    lightOffset.y,
    r * 0.05,
    0,
    0,
    r * 1.25,
  );
  g.addColorStop(0, rgba(lighten(color, 0.5), 0.56 * alpha));
  g.addColorStop(0.5, rgba(color, 0.4 * alpha));
  g.addColorStop(0.85, rgba(color, 0.14 * alpha));
  g.addColorStop(1, rgba(color, 0.02 * alpha)); // fade -> diffused edge
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Internal bioluminescence: core, organ pockets, and veins, clipped inside
 * the membrane so the glow reads as embedded tissue, never an outline. */
function paintInterior(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  pts: Pt[],
  t: number,
  r: number,
  glowColor: string,
  alpha: number,
  glow: number,
) {
  const p = o.profile;
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  // Wandering core just off-center (asymmetry). Kept diffuse — a soft inner
  // luminosity, never a crisp pinpoint that would read as an "eye" or dot.
  const cx = Math.cos(t * 0.3 + p.jitterSeed) * r * 0.08;
  const cy = Math.sin(t * 0.4 + p.jitterSeed) * r * 0.06;
  const corePulse = 0.55 + 0.45 * (Math.sin(o.pulsePhase) * 0.5 + 0.5);
  const coreR = r * (0.7 + p.density * 0.2);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, rgba(lighten(glowColor, 0.22), 0.2 * alpha * glow * corePulse));
  core.addColorStop(0.4, rgba(glowColor, 0.13 * alpha * glow * corePulse));
  core.addColorStop(1, rgba(glowColor, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();

  // Veins — faint, wavy, tapering threads of light from the core outward.
  for (const v of p.veins) {
    const segs = 6;
    let px = cx;
    let py = cy;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const wob = Math.sin(t * 0.8 + v.phase + f * 5) * v.wobble * r * f;
      const ang = v.angle + Math.cos(t * 0.4 + v.phase) * v.wobble;
      px = cx + Math.cos(ang) * v.len * r * f - Math.sin(ang) * wob;
      py = cy + Math.sin(ang) * v.len * r * f + Math.cos(ang) * wob;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = rgba(glowColor, 0.08 * alpha * glow);
    ctx.lineWidth = Math.max(0.6, r * 0.03);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Organ pockets — soft glowing sacs drifting within the tissue.
  for (const pk of p.pockets) {
    const drift = Math.sin(t * 0.5 + pk.phase);
    const px = pk.x * r + drift * r * 0.04;
    const py = pk.y * r + Math.cos(t * 0.45 + pk.phase) * r * 0.04;
    const pr = pk.r * r * (0.85 + 0.15 * (Math.sin(o.pulsePhase + pk.phase) * 0.5 + 0.5));
    const col = pk.warm ? PALETTE.amberGlow : glowColor;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, rgba(lighten(col, 0.3), 0.32 * alpha * glow));
    grad.addColorStop(0.6, rgba(col, 0.12 * alpha * glow));
    grad.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Cilia / marginal hairs — short, fuzzy, shimmering filaments around an arc of
 * the membrane. Drawn as faint tapered hairs, never spokes. */
function paintCilia(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  pts: Pt[],
  t: number,
  r: number,
  color: string,
  alpha: number,
  arcStart: number,
  arcEnd: number,
) {
  const count = o.profile.cilia;
  if (count <= 0 || alpha <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  const n = pts.length;
  for (let i = 0; i < count; i++) {
    const a = arcStart + (arcEnd - arcStart) * (i / (count - 1 || 1));
    const idx = Math.floor(((a % (Math.PI * 2)) / (Math.PI * 2)) * n + n) % n;
    const base = pts[idx];
    const len = r * (0.1 + 0.06 * (Math.sin(t * 2 + i * 0.7) * 0.5 + 0.5));
    const wave = Math.sin(t * 3 + i * 0.9) * 0.4;
    const dir = Math.atan2(base.y, base.x) + wave;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x + Math.cos(dir) * len, base.y + Math.sin(dir) * len);
    ctx.strokeStyle = rgba(color, 0.1 * alpha);
    ctx.lineWidth = Math.max(0.5, r * 0.015);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Appendages: tendrils / arms / tails as tapered, undulating ribbons
// ---------------------------------------------------------------------------

function wrapPi(a: number): number {
  return ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
}

function tendrilSpine(
  o: Organism,
  td: Tendril,
  t: number,
  r: number,
  reachForward: boolean,
): Pt[] {
  const segs = 13;
  // Root sits just inside the membrane in the attachment direction.
  let px = Math.cos(td.base) * r * 0.72;
  let py = Math.sin(td.base) * r * 0.66;
  const pts: Pt[] = [{ x: px, y: py }];
  // Filaments are dragged by the medium: they bend from their attachment angle
  // toward the trailing flow (or forward, for reaching arms), keeping a little
  // residual spread so the curtain fans rather than collapsing to one line.
  const flow = reachForward ? 0 : Math.PI;
  const residual = wrapPi(td.base - flow);
  const segLen = (td.length * r) / segs;
  // Contraction drives a recoil ripple down each filament (follow-through).
  const recoil = (o.contraction - 0.5) * (reachForward ? -0.5 : 0.6);
  let ang = td.base;
  for (let i = 1; i <= segs; i++) {
    const f = i / segs;
    const travel = Math.sin(t * td.swaySpeed * 2.2 + td.phase - f * 5);
    const wob =
      travel * td.swayAmp * (0.4 + f) +
      fbm1D(td.phase + f * 2.5 + t * td.swaySpeed, 2) * td.swayAmp * 0.6 * f;
    // Target heading: converge toward flow, retain residual spread, and add a
    // progressive curl so filaments hook and drift instead of going straight.
    const target = flow + residual * (1 - f * 0.78) + td.curl * f * 1.5 + recoil * f;
    ang += wrapPi(target - ang) * 0.5 + wob * 0.4;
    px += Math.cos(ang) * segLen;
    py += Math.sin(ang) * segLen;
    pts.push({ x: px, y: py });
  }
  return pts;
}

/** Tapered translucent ribbon along a spine, brighter at the root. */
function paintRibbon(
  ctx: CanvasRenderingContext2D,
  spine: Pt[],
  baseWidth: number,
  color: string,
  rootAlpha: number,
  tipAlpha: number,
) {
  const n = spine.length;
  if (n < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const w = baseWidth * (1 - f) ** 1.3 + baseWidth * 0.04;
    const a = spine[Math.min(i + 1, n - 1)];
    const b = spine[Math.max(i - 1, 0)];
    const tx = a.x - b.x;
    const ty = a.y - b.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    left.push({ x: spine[i].x + nx * w, y: spine[i].y + ny * w });
    right.push({ x: spine[i].x - nx * w, y: spine[i].y - ny * w });
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  const g = ctx.createLinearGradient(
    spine[0].x,
    spine[0].y,
    spine[n - 1].x,
    spine[n - 1].y,
  );
  g.addColorStop(0, rgba(color, rootAlpha));
  g.addColorStop(1, rgba(color, tipAlpha));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function paintTendril(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  td: Tendril,
  t: number,
  r: number,
  color: string,
  glowColor: string,
  alpha: number,
  reachForward: boolean,
) {
  const spine = tendrilSpine(o, td, t, r, reachForward);
  const w = td.width * r;
  // Soft body of the tendril.
  paintRibbon(ctx, spine, w, color, 0.4 * alpha, 0.0);
  // Bioluminescent thread of light running through it — dimmer at the crowded
  // root so the attachment band doesn't read as a hard glowing arc.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  paintRibbon(ctx, spine, w * 0.4, glowColor, 0.2 * alpha, 0.0);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Side fins (hunter / swarmer): undulating membranous wings, not shapes.
// ---------------------------------------------------------------------------

function paintFins(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  color: string,
  alpha: number,
) {
  const span = o.profile.finSpan;
  if (span <= 0) return;
  const elong = o.profile.aspect;
  for (const side of [-1, 1]) {
    const pts: Pt[] = [];
    const segs = 9;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      // Run the fin along the body length (x), bulging outward (y) with a
      // travelling ripple — a cuttlefish skirt.
      const x = (f - 0.5) * r * 1.5 * elong;
      const ripple = Math.sin(t * 4 + f * 6 + (side > 0 ? 0 : Math.PI)) * 0.35;
      const bulge =
        Math.sin(f * Math.PI) * r * span * (0.5 + 0.5 * o.joyFactor * 0.5);
      const y = side * (r * 0.55 + bulge * (0.7 + ripple));
      pts.push({ x, y });
    }
    // Build a thin closed sliver hugging the body edge.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i].x, side * r * 0.45 + (pts[i].y - side * r * 0.45) * 0.2);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, side * r * 0.4, 0, side * r * 1.6);
    g.addColorStop(0, rgba(color, 0.16 * alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Archetype assemblies
// ---------------------------------------------------------------------------

function drawDrifter(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  baseAlpha: number,
  limbAlpha: number,
  glow: number,
  tighten: number,
) {
  // Broad flat disc bell — moon-jellyfish style. Joy makes the bell wider and
  // more expressive; high joy creatures have an almost pancake silhouette.
  const bellWidth = 1.06 + o.joyFactor * 0.14;
  const shape: BodyShape = {
    rBase: 1.0,
    elong: 0.86 + o.profile.asym * 0.04,
    squash: bellWidth,
    frontFull: 1.22 + o.joyFactor * 0.08,
    backTaper: 0.80 - o.joyFactor * 0.06,
    contractAmt: 0.6,
  };
  // Trailing oral arms + tentacles first (behind the bell).
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, false);
  }
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, { x: r * 0.2, y: -r * 0.32 });
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  // Marginal cilia along the full trailing rim.
  paintCilia(ctx, o, pts, t, r, glowColor, limbAlpha, Math.PI * 0.35, Math.PI * 1.65);
}

function drawSwarmer(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  baseAlpha: number,
  limbAlpha: number,
  glow: number,
  tighten: number,
) {
  // Larval — small, dart-like, highly elongated. These are the fast ones.
  const shape: BodyShape = {
    rBase: 0.70,           // noticeably smaller than other archetypes
    elong: o.profile.aspect * 1.05,
    squash: 0.60,          // very squashed cross-section
    frontFull: 1.14,
    backTaper: 0.28,       // sharp needle tail
    contractAmt: 0.38,
  };
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, false);
  }
  paintFins(ctx, o, t, r * 0.68, bodyColor, limbAlpha * 0.85);
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, { x: r * 0.42, y: -r * 0.18 });
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow * 1.15);
}

function drawFloater(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  baseAlpha: number,
  limbAlpha: number,
  glow: number,
  tighten: number,
) {
  // Highly inflated sac — maximum volume, very thin translucent wall.
  // Complexity-driven density makes more complex ideas appear more "loaded."
  const inflation = 1.06 + o.profile.density * 0.14;
  const shape: BodyShape = {
    rBase: inflation,
    elong: 1.0,
    squash: 0.98,
    frontFull: 1.03,
    backTaper: 1.0,    // nearly spherical
    contractAmt: 0.22, // barely contracts — fragile membrane
  };
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha * 0.8, false);
  }
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  // Very translucent — the organs inside are the main visual interest.
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha * 0.78, { x: -r * 0.15, y: -r * 0.28 });
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha * 1.1, glow);
  // Dense cilia all around the fragile membrane perimeter.
  paintCilia(ctx, o, pts, t, r, glowColor, limbAlpha * 0.9, 0, Math.PI * 2);
}

function drawHunter(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  baseAlpha: number,
  limbAlpha: number,
  glow: number,
  tighten: number,
) {
  // Cephalopod — most elongated of all archetypes, deliberate and directional.
  const shape: BodyShape = {
    rBase: 0.93,
    elong: o.profile.aspect * 1.08,  // extra elongation
    squash: 0.64,                     // noticeably compressed cross-section
    frontFull: 1.08,
    backTaper: 0.28,                  // very sharp posterior
    contractAmt: 0.20,
  };
  // Undulating side fins run the length of the mantle.
  paintFins(ctx, o, t, r, bodyColor, limbAlpha);
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, { x: r * 0.45, y: -r * 0.25 });
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  // Arms reach forward, drawn on top of the body (in front of the mantle).
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, true);
  }
}

function drawColonial(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  baseAlpha: number,
  limbAlpha: number,
  glow: number,
  tighten: number,
) {
  // Siphonophore / colonial tunicate — large, near-spherical, highly translucent.
  // Internal "zooids" glow brightly through the ghost membrane; filaments emanate
  // omnidirectionally and drift on slow lazy currents.
  const shape: BodyShape = {
    rBase: 1.12,           // larger than other archetypes
    elong: o.profile.aspect,
    squash: 0.99,
    frontFull: 1.04,
    backTaper: 1.0,        // round — no real front/back
    contractAmt: 0.16,     // almost no muscular contraction
  };
  // All filaments radiate outward in every direction.
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha * 0.6, false);
  }
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  // Ghostly membrane — almost entirely transparent; the interior is the animal.
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha * 0.68, { x: 0, y: -r * 0.18 });
  // Vivid internal glow from zooid pockets, burning through the thin skin.
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha * 1.25, glow * 1.15);
  // Very dense cilia covering the entire outer surface.
  paintCilia(ctx, o, pts, t, r, glowColor, limbAlpha * 0.88, 0, Math.PI * 2);
}
