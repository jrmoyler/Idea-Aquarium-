import type { Archetype, Idea } from "../types";
import { mulberry32 } from "./utils";

// ---------------------------------------------------------------------------
// RenderProfile — the precomputed "anatomy" of a single organism.
//
// Everything visual is grown once from the idea's traits + a seeded RNG so the
// creature is deterministic, slightly asymmetric, and irregular. The renderer
// only animates these parts over time; it never lays out perfect geometry.
// ---------------------------------------------------------------------------

export interface Tendril {
  /** Attachment direction around the body margin, in the body's local frame
   * where +x points along the heading (so most tendrils trail backward). */
  base: number;
  length: number; // in radius units
  width: number; // base thickness in radius units
  phase: number; // individual sway phase offset
  swayAmp: number; // lateral undulation amplitude
  swaySpeed: number;
  curl: number; // resting curl (gentle bias so they're never straight)
  kind: "oralArm" | "tentacle" | "tail" | "arm" | "filament";
}

export interface Pocket {
  x: number; // local offset, radius units
  y: number;
  r: number; // radius units
  phase: number;
  warm: boolean; // amber metabolic pocket vs cool bioluminescent
}

export interface Vein {
  angle: number; // direction from core
  len: number; // radius units
  phase: number;
  wobble: number;
}

/** A subtle eye glint (cephalopods get a pair, larvae a single faint spot). */
export interface EyeSpot {
  x: number; // local offset, radius units
  y: number;
  r: number; // radius units
  bright: number; // 0..1 base luminosity
}

/** A radial bell canal/septum for the medusa dome — a faint internal rib that
 * fans from the apex toward the margin. Animated, never a stroked spoke. */
export interface BellCanal {
  angle: number; // direction from apex, local frame
  curve: number; // lateral bow so canals are not straight rays
  bright: number;
}

/** A slow-drifting chromatophore-like mottle patch for cephalopod skin. */
export interface MottlePatch {
  x: number; // local offset, radius units
  y: number;
  r: number; // radius units
  phase: number; // slow flicker phase
  warm: boolean;
}

/** A faint bioluminescent freckle scattered through the flesh (micro-texture). */
export interface Freckle {
  x: number; // local offset, radius units (sampled within unit disc)
  y: number;
  r: number; // radius units, small
  phase: number;
  warm: boolean;
}

export interface RenderProfile {
  archetype: Archetype;

  // Silhouette deformation (the body is never a clean circle).
  lobeAmp: number; // overall lumpiness (novelty)
  lobeFreqA: number;
  lobeFreqB: number;
  lobePhaseA: number;
  lobePhaseB: number;
  asym: number; // directional bias so one side is fuller than the other
  aspect: number; // body length-to-width (taper for hunters, dome for drifters)

  tendrils: Tendril[];
  cilia: number; // marginal cilia count
  pockets: Pocket[];
  veins: Vein[];
  finSpan: number; // side-fin reach (hunter / swarmer)

  // --- Realism anatomy (grown deterministically) ---
  eyes: EyeSpot[]; // sensory glints (hunter pair / swarmer single; empty otherwise)
  bellCanals: BellCanal[]; // radial canals of the medusa dome (drifter only)
  gastroRing: number; // 0..1 strength of the medusa gastrovascular ring (drifter)
  mottle: MottlePatch[]; // chromatophore-like skin patches (hunter)
  freckles: Freckle[]; // faint bioluminescent micro-texture across all bodies
  gut: number; // 0..1 strength of an internal gut/organ streak (swarmer/floater)

  warmth: number; // 0..1 internal amber metabolic richness (revenue)
  density: number; // 0..1 internal layering (complexity)
  jitterSeed: number;
}

function range(rng: () => number, a: number, b: number): number {
  return a + rng() * (b - a);
}

/** Grow a creature's anatomy from its idea + archetype, deterministically. */
export function buildProfile(
  idea: Idea,
  archetype: Archetype,
  seed: number,
): RenderProfile {
  const rng = mulberry32(seed ^ 0x9e3779b9);

  const novelty = idea.novelty / 100;
  const complexity = idea.complexity / 100;
  const joy = idea.joy / 100;
  const revenue = idea.revenue / 100;
  const momentum = idea.momentum / 100;

  // More novel ideas read as stranger silhouettes; complexity adds finer lumps.
  const lobeAmp = 0.07 + novelty * 0.16 + complexity * 0.05;
  const asym = (rng() - 0.5) * (0.25 + novelty * 0.4);
  const lobeFreqA = 2 + Math.floor(rng() * 2); // 2..3 broad lobes
  const lobeFreqB = 4 + Math.floor(rng() * 3); // 4..6 finer ripples

  const tendrils: Tendril[] = [];
  let cilia = 0;
  let aspect = 1;
  let finSpan = 0;
  const eyes: EyeSpot[] = [];
  const bellCanals: BellCanal[] = [];
  const mottle: MottlePatch[] = [];
  let gastroRing = 0;
  let gut = 0;

  const swayBase = 0.05 + joy * 0.06;

  switch (archetype) {
    case "drifter": {
      // Medusa: a dome with ruffled oral arms + a curtain of fine tentacles.
      aspect = range(rng, 0.82, 0.95); // slightly flattened bell
      const oralArms = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < oralArms; i++) {
        const spread = (i / Math.max(1, oralArms - 1) - 0.5) * 1.1;
        tendrils.push({
          base: Math.PI + spread, // trail behind heading
          length: range(rng, 2.0, 3.2) * (0.85 + momentum * 0.3),
          width: range(rng, 0.26, 0.4),
          phase: rng() * Math.PI * 2,
          swayAmp: swayBase * range(rng, 1.0, 1.6),
          swaySpeed: range(rng, 0.6, 1.0),
          curl: (rng() - 0.5) * 0.5,
          kind: "oralArm",
        });
      }
      const marginal = 9 + Math.floor(joy * 6) + Math.floor(rng() * 4);
      for (let i = 0; i < marginal; i++) {
        const spread = (i / (marginal - 1) - 0.5) * 1.7;
        tendrils.push({
          base: Math.PI + spread,
          length: range(rng, 1.5, 2.8) * (0.8 + momentum * 0.4),
          width: range(rng, 0.05, 0.11),
          phase: rng() * Math.PI * 2,
          swayAmp: swayBase * range(rng, 1.2, 2.0),
          swaySpeed: range(rng, 0.8, 1.4),
          curl: (rng() - 0.5) * 0.9,
          kind: "tentacle",
        });
      }
      cilia = 14 + Math.floor(rng() * 8);
      // Radial canals fanning from the apex down the bell — a believable medusa
      // internal structure. Count scales gently with complexity.
      const canalCount = 5 + Math.floor(rng() * 3) + Math.round(complexity * 3);
      for (let i = 0; i < canalCount; i++) {
        bellCanals.push({
          angle: (i / canalCount) * Math.PI * 2 + (rng() - 0.5) * 0.2,
          curve: (rng() - 0.5) * 0.5,
          bright: range(rng, 0.5, 1),
        });
      }
      gastroRing = 0.5 + complexity * 0.4;
      // Jellyfish have no eyes.
      break;
    }
    case "swarmer": {
      // Larva: a small flexing body with a flicking tail + a couple of fins.
      aspect = range(rng, 1.25, 1.6); // elongated
      tendrils.push({
        base: Math.PI,
        length: range(rng, 1.6, 2.4),
        width: range(rng, 0.16, 0.24),
        phase: rng() * Math.PI * 2,
        swayAmp: swayBase * range(rng, 2.0, 3.0),
        swaySpeed: range(rng, 1.4, 2.2),
        curl: 0,
        kind: "tail",
      });
      // Two short trailing filaments for a hint of fin.
      for (let i = 0; i < 2; i++) {
        tendrils.push({
          base: Math.PI + (i === 0 ? 0.5 : -0.5),
          length: range(rng, 0.7, 1.1),
          width: range(rng, 0.05, 0.09),
          phase: rng() * Math.PI * 2,
          swayAmp: swayBase * 2.4,
          swaySpeed: range(rng, 1.6, 2.4),
          curl: (rng() - 0.5) * 0.6,
          kind: "filament",
        });
      }
      finSpan = range(rng, 0.5, 0.8);
      cilia = 4 + Math.floor(rng() * 3);
      // A single faint sensory eye spot near the head (leading edge, +x), set
      // slightly off the midline so it never reads as a centred cartoon dot.
      eyes.push({
        x: range(rng, 0.42, 0.58),
        y: (rng() < 0.5 ? -1 : 1) * range(rng, 0.06, 0.14),
        r: range(rng, 0.1, 0.15),
        bright: range(rng, 0.45, 0.7),
      });
      // A translucent gut streak running the body length.
      gut = 0.6 + complexity * 0.4;
      break;
    }
    case "floater": {
      // Sac: nearly round, fragile, with short drifting threads + cilia.
      aspect = range(rng, 0.9, 1.08);
      const threads = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < threads; i++) {
        const ang = rng() * Math.PI * 2;
        tendrils.push({
          base: ang,
          length: range(rng, 0.8, 1.5),
          width: range(rng, 0.04, 0.08),
          phase: rng() * Math.PI * 2,
          swayAmp: swayBase * range(rng, 0.8, 1.4),
          swaySpeed: range(rng, 0.4, 0.8),
          curl: (rng() - 0.5) * 1.2,
          kind: "filament",
        });
      }
      cilia = 10 + Math.floor(rng() * 8);
      // A faint suspended gut/organ knot inside the fragile sac.
      gut = 0.35 + complexity * 0.35;
      break;
    }
    case "hunter": {
      // Cephalopod: tapered mantle, undulating side fins, reaching arms.
      aspect = range(rng, 1.3, 1.7);
      const arms = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < arms; i++) {
        const spread = (i / (arms - 1) - 0.5) * 1.0;
        tendrils.push({
          // Arms reach forward (toward heading, +x) — intentional, hunting.
          base: spread,
          length: range(rng, 1.4, 2.3) * (0.85 + momentum * 0.3),
          width: range(rng, 0.08, 0.16),
          phase: rng() * Math.PI * 2,
          swayAmp: swayBase * range(rng, 0.9, 1.5),
          swaySpeed: range(rng, 0.7, 1.2),
          curl: (rng() - 0.5) * 0.6,
          kind: "arm",
        });
      }
      finSpan = range(rng, 0.9, 1.25);
      cilia = 0;
      // A symmetric pair of eyes set back from the arm crown, toward the head
      // (+x). Kept dim and small — sensory glints, not googly eyes.
      {
        const ex = range(rng, 0.34, 0.46);
        const ey = range(rng, 0.16, 0.26);
        const er = range(rng, 0.1, 0.15);
        const eb = range(rng, 0.4, 0.6);
        eyes.push({ x: ex, y: -ey, r: er, bright: eb });
        eyes.push({ x: ex, y: ey, r: er, bright: eb });
      }
      // Chromatophore-like patches scattered over the mantle that flicker slowly.
      const mottleCount = 4 + Math.floor(rng() * 4) + Math.round(complexity * 3);
      for (let i = 0; i < mottleCount; i++) {
        const ang = rng() * Math.PI * 2;
        const dist = range(rng, 0.15, 0.7);
        mottle.push({
          x: Math.cos(ang) * dist * aspect,
          y: Math.sin(ang) * dist * 0.6,
          r: range(rng, 0.12, 0.26),
          phase: rng() * Math.PI * 2,
          warm: rng() < 0.35 + revenue * 0.4,
        });
      }
      break;
    }
    default: {
      const _never: never = archetype;
      return _never;
    }
  }

  // Internal glow pockets — complexity adds more layered organs.
  const pocketCount = 1 + Math.round(complexity * 3) + (archetype === "floater" ? 1 : 0);
  const pockets: Pocket[] = [];
  for (let i = 0; i < pocketCount; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = range(rng, 0.1, 0.5);
    pockets.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist * 0.8,
      r: range(rng, 0.14, 0.3),
      phase: rng() * Math.PI * 2,
      // The richest, most valuable ideas glow amber from within.
      warm: rng() < revenue * 0.9,
    });
  }

  // Bioluminescent veins threading out from the core (complexity -> denser).
  const veinCount = Math.round(complexity * 5) + 2;
  const veins: Vein[] = [];
  for (let i = 0; i < veinCount; i++) {
    veins.push({
      angle: rng() * Math.PI * 2,
      len: range(rng, 0.45, 0.85),
      phase: rng() * Math.PI * 2,
      wobble: range(rng, 0.1, 0.3),
    });
  }

  // Faint bioluminescent freckles scattered through the flesh so the membrane
  // is never a flat gradient. Sampled within the unit disc; count is modest for
  // performance and scales a little with complexity.
  const freckleCount = 8 + Math.round(complexity * 10);
  const freckles: Freckle[] = [];
  for (let i = 0; i < freckleCount; i++) {
    // Rejection-free disc sample via sqrt radius for even spread.
    const fa = rng() * Math.PI * 2;
    const fr = Math.sqrt(rng()) * 0.82;
    freckles.push({
      x: Math.cos(fa) * fr,
      y: Math.sin(fa) * fr,
      r: range(rng, 0.012, 0.03),
      phase: rng() * Math.PI * 2,
      warm: rng() < 0.25 + revenue * 0.5,
    });
  }

  return {
    archetype,
    lobeAmp,
    lobeFreqA,
    lobeFreqB,
    lobePhaseA: rng() * Math.PI * 2,
    lobePhaseB: rng() * Math.PI * 2,
    asym,
    aspect,
    tendrils,
    cilia,
    pockets,
    veins,
    finSpan,
    eyes,
    bellCanals,
    gastroRing,
    mottle,
    freckles,
    gut,
    warmth: revenue,
    density: complexity,
    jitterSeed: rng() * 1000,
  };
}
