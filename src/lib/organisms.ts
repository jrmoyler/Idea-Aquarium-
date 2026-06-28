import type { Organism } from "./simulation";
import type { RenderProfile, Tendril } from "./organism-profile";
import { coolShade, darken, lighten, mixHex, PALETTE, PALETTE_EXT, rgba } from "./color";
import { clamp } from "./utils";
import { fbm1D, loopNoise } from "./noise";

// Directional light convention: a top-down (slightly forward) source. In the
// body's LOCAL frame the body has been rotated by heading, so "up" on screen is
// not fixed in local space; we approximate the lit side as the upper region
// (-y) of the membrane, which reads as countershaded regardless of heading
// because the dome/mantle are roughly radially symmetric. Kept subtle.
const LIGHT_DIR = { x: 0.18, y: -1 };

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

  // Top-down light expressed in the body's local (heading-rotated) frame, so
  // countershading and the specular sheen stay anchored to screen-up no matter
  // which way the creature points.
  const ch = Math.cos(-o.heading);
  const sh = Math.sin(-o.heading);
  const light: Pt = {
    x: LIGHT_DIR.x * ch - LIGHT_DIR.y * sh,
    y: LIGHT_DIR.x * sh + LIGHT_DIR.y * ch,
  };

  switch (o.archetype) {
    case "drifter":
      drawDrifter(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten, light);
      break;
    case "swarmer":
      drawSwarmer(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten, light);
      break;
    case "floater":
      drawFloater(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten, light);
      break;
    case "hunter":
      drawHunter(ctx, o, t, r, bodyColor, glowColor, baseAlpha, limbAlpha, glow, tighten, light);
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

/** Translucent flesh with a soft, diffused edge (no stroked outline). Layers
 * subsurface scattering: a cool countershaded base, a denser opaque-ish core, a
 * back-lit fresnel rim where the body is thin, and a wet specular sheen. */
function paintMembrane(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  r: number,
  color: string,
  alpha: number,
  lightOffset: Pt,
  light: Pt,
) {
  // Where the lit side sits within the body (top, per the directional light).
  const litX = light.x * r * 0.42;
  const litY = light.y * r * 0.42;
  // Cooler, deeper-blue tint for the shadowed underside.
  const underColor = coolShade(darken(color, 0.32), 0.5);

  // 1) Diffused translucent base — countershaded along the light axis. Top is
  //    lighter/warmer flesh, underside fades to a cool deep-blue shadow.
  ctx.save();
  ctx.shadowColor = rgba(color, 0.4 * alpha);
  ctx.shadowBlur = r * 0.45;
  tracePath(ctx, pts);
  const g = ctx.createLinearGradient(litX, litY, -litX * 1.6, -litY * 1.6);
  g.addColorStop(0, rgba(lighten(color, 0.42), 0.52 * alpha));
  g.addColorStop(0.45, rgba(color, 0.4 * alpha));
  g.addColorStop(0.8, rgba(underColor, 0.26 * alpha));
  g.addColorStop(1, rgba(underColor, 0.05 * alpha)); // diffused shadowed edge
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // 2) Denser, more opaque core so the centre reads as thicker gelatin while
  //    the margins stay translucent. Offset toward the light.
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  const core = ctx.createRadialGradient(
    lightOffset.x,
    lightOffset.y,
    r * 0.04,
    lightOffset.x * 0.3,
    lightOffset.y * 0.3,
    r * 0.95,
  );
  core.addColorStop(0, rgba(lighten(color, 0.3), 0.34 * alpha));
  core.addColorStop(0.55, rgba(color, 0.16 * alpha));
  core.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = core;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  ctx.restore();

  // 3) Back-lit fresnel rim — brighter scattered light where the membrane is
  //    thin (the margin), built as a radial fade and clipped, never stroked.
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const rim = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * 1.12);
  rim.addColorStop(0, rgba(color, 0));
  rim.addColorStop(0.78, rgba(lighten(color, 0.35), 0.07 * alpha));
  rim.addColorStop(1, rgba(lighten(PALETTE_EXT.scatterCyan, 0.1), 0.16 * alpha));
  ctx.fillStyle = rim;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  ctx.restore();

  // 4) Wet specular sheen — a small soft highlight near the top of the dome.
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const sx = litX * 1.1;
  const sy = litY * 1.1;
  const sheen = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.5);
  sheen.addColorStop(0, rgba(lighten(color, 0.75), 0.22 * alpha));
  sheen.addColorStop(0.5, rgba(lighten(color, 0.5), 0.07 * alpha));
  sheen.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(sx, sy, r * 0.5, r * 0.32, Math.atan2(light.y, light.x) + Math.PI / 2, 0, Math.PI * 2);
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

  // Internal gut/organ streak (swarmer larva / floater sac). A soft elongated
  // luminous knot suspended in the body — diffuse, never a hard shape.
  if (p.gut > 0.01) {
    const breath = 0.85 + 0.15 * (Math.sin(o.pulsePhase * 0.8 + p.jitterSeed) * 0.5 + 0.5);
    const gw = r * (0.5 + p.density * 0.2);
    const gh = r * 0.2 * breath;
    const gy = r * 0.04 * Math.sin(t * 0.5 + p.jitterSeed);
    const gcol = mixHex(glowColor, PALETTE.amberGlow, p.warmth * 0.5);
    const gg = ctx.createRadialGradient(0, gy, 0, 0, gy, gw);
    gg.addColorStop(0, rgba(lighten(gcol, 0.2), 0.18 * alpha * glow * p.gut));
    gg.addColorStop(0.6, rgba(gcol, 0.08 * alpha * glow * p.gut));
    gg.addColorStop(1, rgba(gcol, 0));
    ctx.save();
    ctx.translate(-r * 0.1, 0);
    ctx.scale(1, gh / gw);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(0, gy * (gw / gh), gw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Faint bioluminescent freckles — subtle micro-texture so flesh isn't a flat
  // gradient. Tiny, dim, slowly twinkling dots embedded in the tissue.
  for (const fk of p.freckles) {
    const tw = 0.5 + 0.5 * Math.sin(t * 0.9 + fk.phase);
    const fx = fk.x * r;
    const fy = fk.y * r;
    const fr = fk.r * r;
    const col = fk.warm ? PALETTE.amberGlow : glowColor;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.2);
    fg.addColorStop(0, rgba(lighten(col, 0.4), 0.16 * alpha * glow * (0.4 + tw * 0.6)));
    fg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Radial bell canals + gastrovascular ring for the medusa dome (drifter).
 * Drawn clipped inside the membrane as faint internal ribs fanning from the
 * apex — never stroked spokes on the outside. */
function paintBell(
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
  if (p.bellCanals.length === 0) return;
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  // Apex sits slightly forward (+x), canals fan to the trailing margin.
  const apexX = r * 0.12;
  const apexY = 0;
  const pulse = 0.6 + 0.4 * (Math.sin(o.pulsePhase) * 0.5 + 0.5);
  for (const cn of p.bellCanals) {
    const segs = 7;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      // Bow the canal laterally so it curves rather than radiating straight.
      const bow = cn.curve * Math.sin(f * Math.PI) + Math.sin(t * 0.5 + cn.angle) * 0.05;
      const ang = cn.angle + bow;
      const reach = r * (0.95 + p.lobeAmp * 0.4) * f;
      const px = apexX + Math.cos(ang) * reach * 0.92;
      const py = apexY + Math.sin(ang) * reach;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = rgba(glowColor, 0.05 * alpha * glow * cn.bright * pulse);
    ctx.lineWidth = Math.max(0.6, r * 0.02);
    ctx.stroke();
  }

  // Gastrovascular ring — a faint luminous band part-way out, drawn as a soft
  // radial difference (annulus via two stops), clipped, not a stroked circle.
  if (p.gastroRing > 0.01) {
    const ringR = r * 0.5;
    const rg = ctx.createRadialGradient(apexX, apexY, ringR * 0.62, apexX, apexY, ringR * 1.18);
    rg.addColorStop(0, rgba(glowColor, 0));
    rg.addColorStop(0.5, rgba(lighten(glowColor, 0.2), 0.07 * alpha * glow * p.gastroRing * pulse));
    rg.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  }
  ctx.restore();
}

/** Slow chromatophore-like mottling for the cephalopod mantle (hunter).
 * Soft patches that brighten/dim on individual slow phases. */
function paintMottle(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  pts: Pt[],
  t: number,
  r: number,
  bodyColor: string,
  glowColor: string,
  alpha: number,
) {
  const p = o.profile;
  if (p.mottle.length === 0) return;
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  for (const m of p.mottle) {
    // Slow flicker — chromatophores expanding and contracting.
    const flick = 0.5 + 0.5 * Math.sin(t * 0.6 + m.phase) * Math.cos(t * 0.23 + m.phase * 1.7);
    const mx = m.x * r;
    const my = m.y * r;
    const mr = m.r * r * (0.8 + 0.2 * flick);
    const col = m.warm ? mixHex(bodyColor, PALETTE.amber, 0.5) : darken(bodyColor, 0.25);
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    // Mostly subtractive-feeling darker pigment with a faint luminous edge.
    mg.addColorStop(0, rgba(col, 0.16 * alpha * (0.4 + flick * 0.6)));
    mg.addColorStop(0.7, rgba(col, 0.06 * alpha));
    mg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
  // A faint warm shimmer riding over the patches for iridescence.
  ctx.globalCompositeOperation = "lighter";
  for (const m of p.mottle) {
    if (!m.warm) continue;
    const flick = 0.5 + 0.5 * Math.sin(t * 0.6 + m.phase + 1);
    const mx = m.x * r;
    const my = m.y * r;
    const mr = m.r * r * 0.6;
    const sg = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    sg.addColorStop(0, rgba(lighten(glowColor, 0.2), 0.05 * alpha * flick));
    sg.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Subtle sensory eye glints (hunter pair / swarmer single). Soft, dim, and
 * embedded — a darker pigment cup with a small bright catch-light, clipped
 * inside the body so it never reads as a cartoon eye stuck on the surface. */
function paintEyes(
  ctx: CanvasRenderingContext2D,
  o: Organism,
  pts: Pt[],
  t: number,
  r: number,
  glowColor: string,
  alpha: number,
) {
  const p = o.profile;
  if (p.eyes.length === 0) return;
  ctx.save();
  tracePath(ctx, pts);
  ctx.clip();
  for (const e of p.eyes) {
    const ex = e.x * r;
    const ey = e.y * r;
    const er = e.r * r;
    // Pigment cup — a soft dark lens, slightly cool.
    const cup = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
    cup.addColorStop(0, rgba(PALETTE.navyDeep, 0.5 * alpha));
    cup.addColorStop(0.65, rgba(PALETTE_EXT.abyssBlue, 0.3 * alpha));
    cup.addColorStop(1, rgba(PALETTE_EXT.abyssBlue, 0));
    ctx.fillStyle = cup;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    // Catch-light — a tiny luminous glint that drifts a touch, top-lit.
    const blink = 0.7 + 0.3 * Math.sin(t * 0.7 + e.x * 10);
    const gx = ex - er * 0.3;
    const gy = ey - er * 0.35;
    const gr = er * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const cl = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    cl.addColorStop(0, rgba(lighten(glowColor, 0.5), 0.5 * alpha * e.bright * blink));
    cl.addColorStop(1, rgba(glowColor, 0));
    ctx.fillStyle = cl;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    // Smooth taper that thins to a fine, soft tip (sin profile keeps the root
    // full and the very end whisker-thin so filaments never look stiff/blunt).
    const w = baseWidth * Math.cos(f * Math.PI * 0.5) ** 1.2 + baseWidth * 0.02;
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
  // Trace both edges with quadratic midpoint smoothing so the ribbon reads as a
  // continuous flowing membrane rather than a chain of straight segments.
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n - 1; i++) {
    ctx.quadraticCurveTo(left[i].x, left[i].y, (left[i].x + left[i + 1].x) / 2, (left[i].y + left[i + 1].y) / 2);
  }
  ctx.lineTo(left[n - 1].x, left[n - 1].y);
  ctx.lineTo(right[n - 1].x, right[n - 1].y);
  for (let i = n - 2; i >= 1; i--) {
    ctx.quadraticCurveTo(right[i].x, right[i].y, (right[i].x + right[i - 1].x) / 2, (right[i].y + right[i - 1].y) / 2);
  }
  ctx.lineTo(right[0].x, right[0].y);
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
  // Suckers hinted on cephalopod arms — a faint dotted highlight line running
  // along the inner length. Very subtle, fades toward the tip.
  if (td.kind === "arm" && w > r * 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const n = spine.length;
    for (let i = 1; i < n - 1; i += 2) {
      const f = i / (n - 1);
      const sr = w * (1 - f) * 0.28 + 0.4;
      const sg = ctx.createRadialGradient(spine[i].x, spine[i].y, 0, spine[i].x, spine[i].y, sr);
      sg.addColorStop(0, rgba(lighten(glowColor, 0.3), 0.12 * alpha * (1 - f)));
      sg.addColorStop(1, rgba(glowColor, 0));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(spine[i].x, spine[i].y, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** A soft self-shadow cast onto the body where an appendage crosses it — a
 * small dark smudge near the attachment root. Clipped to the body so it never
 * leaks past the silhouette. */
function paintAppendageShadow(
  ctx: CanvasRenderingContext2D,
  bodyPts: Pt[],
  td: Tendril,
  r: number,
  alpha: number,
) {
  const bx = Math.cos(td.base) * r * 0.55;
  const by = Math.sin(td.base) * r * 0.55;
  const sr = Math.max(r * 0.12, td.width * r * 1.3);
  ctx.save();
  tracePath(ctx, bodyPts);
  ctx.clip();
  const g = ctx.createRadialGradient(bx, by, 0, bx, by, sr);
  g.addColorStop(0, rgba(PALETTE.navyDeep, 0.18 * alpha));
  g.addColorStop(1, rgba(PALETTE.navyDeep, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bx, by, sr, 0, Math.PI * 2);
  ctx.fill();
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
  light: Pt,
) {
  const shape: BodyShape = {
    rBase: 1,
    elong: 0.92,
    squash: 1.04,
    frontFull: 1.18,
    backTaper: 0.86,
    contractAmt: 0.55,
  };
  // Trailing oral arms + tentacles first (behind the bell), layered back-to-
  // front: thinner tentacles first, fuller oral arms on top, so the curtain
  // reads with depth.
  const back = o.profile.tendrils.filter((d) => d.kind === "tentacle");
  const front = o.profile.tendrils.filter((d) => d.kind !== "tentacle");
  for (const td of back) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha * 0.8, false);
  }
  for (const td of front) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, false);
  }
  const lightOffset: Pt = { x: light.x * r * 0.32, y: light.y * r * 0.34 };
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, lightOffset, light);
  paintBell(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  // Marginal cilia around the trailing rim of the bell.
  paintCilia(ctx, o, pts, t, r, glowColor, limbAlpha, Math.PI * 0.4, Math.PI * 1.6);
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
  light: Pt,
) {
  const shape: BodyShape = {
    rBase: 0.82,
    elong: o.profile.aspect,
    squash: 0.72,
    frontFull: 1.12,
    backTaper: 0.4,
    contractAmt: 0.3,
  };
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, false);
  }
  paintFins(ctx, o, t, r * 0.7, bodyColor, limbAlpha * 0.8);
  const lightOffset: Pt = { x: r * 0.3 + light.x * r * 0.18, y: light.y * r * 0.22 };
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, lightOffset, light);
  // Self-shadow where the tail attaches to the trailing body.
  for (const td of o.profile.tendrils) {
    paintAppendageShadow(ctx, pts, td, r, baseAlpha);
  }
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow * 1.1);
  // A single faint sensory eye spot near the head.
  paintEyes(ctx, o, pts, t, r, glowColor, baseAlpha);
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
  light: Pt,
) {
  const shape: BodyShape = {
    rBase: 1.02,
    elong: 1.0,
    squash: 0.96,
    frontFull: 1.0,
    backTaper: 0.96,
    contractAmt: 0.4,
  };
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha * 0.85, false);
  }
  const lightOffset: Pt = { x: light.x * r * 0.28, y: light.y * r * 0.34 };
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  // Extra-fragile sac: slightly more translucent flesh.
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha * 0.86, lightOffset, light);
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  // A full skirt of cilia all around the fragile sac.
  paintCilia(ctx, o, pts, t, r, glowColor, limbAlpha * 0.8, 0, Math.PI * 2);
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
  light: Pt,
) {
  const shape: BodyShape = {
    rBase: 0.92,
    elong: o.profile.aspect,
    squash: 0.7,
    frontFull: 1.06,
    backTaper: 0.36,
    contractAmt: 0.22,
  };
  // Undulating side fins run the length of the mantle.
  paintFins(ctx, o, t, r, bodyColor, limbAlpha);
  const lightOffset: Pt = { x: r * 0.32 + light.x * r * 0.2, y: light.y * r * 0.24 };
  const pts = bodyPoints(o.profile, o, t, shape, tighten);
  paintMembrane(ctx, pts, r, bodyColor, baseAlpha, lightOffset, light);
  // Chromatophore-like mottling over the mantle, then the internal glow.
  paintMottle(ctx, o, pts, t, r, bodyColor, glowColor, baseAlpha);
  paintInterior(ctx, o, pts, t, r, glowColor, baseAlpha, glow);
  // A pair of dim sensory eyes set back from the arm crown.
  paintEyes(ctx, o, pts, t, r, glowColor, baseAlpha);
  // Self-shadow where the arms attach at the front of the mantle.
  for (const td of o.profile.tendrils) {
    paintAppendageShadow(ctx, pts, td, r, baseAlpha);
  }
  // Arms reach forward, drawn on top of the body (in front of the mantle).
  for (const td of o.profile.tendrils) {
    paintTendril(ctx, o, td, t, r, bodyColor, glowColor, limbAlpha, true);
  }
}
