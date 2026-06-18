import type { Idea, Species, ViewMode } from "../types";
import { ideaBaseColor } from "./color";
import { clamp, distance, hashString, mulberry32 } from "./utils";

/**
 * A live organism in the tank. Carries its source idea plus physics and
 * pre-computed visual parameters derived deterministically from traits, so the
 * ecosystem feels intentional rather than random.
 */
export interface Organism {
  idea: Idea;
  x: number;
  y: number;
  vx: number;
  vy: number;

  radius: number;
  baseColor: string;

  /** Steering / behavior tuning derived from traits (all roughly 0..2). */
  speedFactor: number; // momentum
  mass: number; // complexity -> turn resistance & visual density
  joyFactor: number; // wander expressiveness + glow
  synergyFactor: number; // cohesion strength
  depthBias: number; // dormant ideas settle lower

  /** Per-species movement signature, so each archetype moves differently. */
  motion: SpeciesMotion;

  // Animation phases (deterministic seeds keep motion coherent).
  wanderAngle: number;
  pulsePhase: number;
  spinPhase: number;
  swayPhase: number;
  seed: number;

  /** Transient render state, eased every frame. */
  hover: number; // 0..1
  selectGlow: number; // 0..1
  mergeGlow: number; // 0..1
  presence: number; // 1 = full, < 1 when another organism holds focus
}

export interface SimulationOptions {
  width: number;
  height: number;
  mode: ViewMode;
}

/** A movement personality applied per species. Amplitudes are intentionally
 * small to keep the tank calm and hypnotic rather than busy. */
interface SpeciesMotion {
  restless: number; // wander amplitude multiplier
  agility: number; // steering responsiveness multiplier
  speed: number; // max-speed multiplier
  swayX: number; // lateral sway amplitude
  swayY: number; // vertical sway amplitude
  swaySpeed: number; // sway oscillation rate
}

const SPECIES_MOTION: Record<Species, SpeciesMotion> = {
  // Steady observers — barely drift, hold their station.
  Sentinel: { restless: 0.45, agility: 0.7, speed: 0.62, swayX: 0.006, swayY: 0.004, swaySpeed: 0.006 },
  // Directional gliders — smooth forward travel, little turning.
  Conduit: { restless: 0.6, agility: 1.25, speed: 1.08, swayX: 0.01, swayY: 0.006, swaySpeed: 0.01 },
  // Orbital weavers of structure — gentle circular drift.
  Lattice: { restless: 0.7, agility: 0.85, speed: 0.82, swayX: 0.016, swayY: 0.016, swaySpeed: 0.012 },
  // Slow lateral wanderers — the calmest, widest sway.
  Drifter: { restless: 0.55, agility: 0.75, speed: 0.7, swayX: 0.024, swayY: 0.008, swaySpeed: 0.007 },
  // Restless catalysts — small eager darts.
  Catalyst: { restless: 1.2, agility: 1.35, speed: 1.18, swayX: 0.014, swayY: 0.012, swaySpeed: 0.02 },
  // Sinuous weavers — a vertical, serpentine weave.
  Weaver: { restless: 0.85, agility: 1.0, speed: 0.92, swayX: 0.012, swayY: 0.022, swaySpeed: 0.016 },
  // Breathing synthesizers — pulse-led, moderate motion.
  Synthesizer: { restless: 0.8, agility: 0.95, speed: 0.88, swayX: 0.014, swayY: 0.014, swaySpeed: 0.013 },
};

const MODE_TEMPO: Record<ViewMode, number> = {
  calm: 0.5,
  active: 1.0,
};

/**
 * Lightweight steering ecosystem: wander + separation + cohesion toward
 * related ideas + soft boundary containment. No external physics deps.
 */
export class Simulation {
  organisms: Organism[] = [];
  width: number;
  height: number;
  mode: ViewMode;

  /** id -> organism for fast adjacency lookups. */
  private byId = new Map<string, Organism>();

  constructor(ideas: Idea[], opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.mode = opts.mode;
    this.spawn(ideas);
  }

  private spawn(ideas: Idea[]) {
    const rng = mulberry32(0x1dea_a9a1);
    this.organisms = ideas.map((idea) => {
      const seed = hashString(idea.id);
      const local = mulberry32(seed);
      const depthBias = idea.status === "dormant" ? 0.72 : 0.42;
      const startY =
        this.height * (depthBias - 0.12) + local() * this.height * 0.3;
      return this.createOrganism(idea, {
        x: this.width * (0.18 + rng() * 0.64),
        y: clamp(startY, 60, this.height - 60),
      });
    });

    this.byId.clear();
    for (const o of this.organisms) this.byId.set(o.idea.id, o);
  }

  private createOrganism(
    idea: Idea,
    pos: { x: number; y: number },
  ): Organism {
    const seed = hashString(idea.id);
    const local = mulberry32(seed);
    const revenue = idea.revenue / 100;
    const radius = 16 + revenue * 18 + (idea.complexity / 100) * 8;
    const depthBias = idea.status === "dormant" ? 0.72 : 0.42;

    return {
      idea,
      x: pos.x,
      y: pos.y,
      vx: (local() - 0.5) * 0.6,
      vy: (local() - 0.5) * 0.6,
      radius,
      baseColor: ideaBaseColor(idea.revenue),
      speedFactor: 0.45 + (idea.momentum / 100) * 1.25,
      mass: 0.6 + (idea.complexity / 100) * 1.4,
      joyFactor: 0.4 + (idea.joy / 100) * 1.6,
      synergyFactor: idea.synergy / 100,
      depthBias,
      motion: SPECIES_MOTION[idea.species],
      wanderAngle: local() * Math.PI * 2,
      pulsePhase: local() * Math.PI * 2,
      spinPhase: local() * Math.PI * 2,
      swayPhase: local() * Math.PI * 2,
      seed,
      hover: 0,
      selectGlow: 0,
      mergeGlow: 0,
      presence: 1,
    };
  }

  /**
   * Reconcile organisms with a (possibly updated) idea list: refresh idea
   * references in place and birth organisms for any newly spawned ideas.
   */
  reconcile(ideas: Idea[]) {
    for (const idea of ideas) {
      const existing = this.byId.get(idea.id);
      if (existing) {
        existing.idea = idea;
        existing.depthBias = idea.status === "dormant" ? 0.72 : 0.42;
        existing.baseColor = ideaBaseColor(idea.revenue);
      } else {
        // New idea spawns near center with a small outward nudge.
        const o = this.createOrganism(idea, {
          x: this.width * 0.5 + (Math.random() - 0.5) * 80,
          y: this.height * 0.42 + (Math.random() - 0.5) * 80,
        });
        o.selectGlow = 0;
        o.mergeGlow = 1; // brief birth flash
        this.organisms.push(o);
        this.byId.set(o.idea.id, o);
      }
    }
  }

  resize(width: number, height: number) {
    const sx = width / this.width;
    const sy = height / this.height;
    this.width = width;
    this.height = height;
    // Keep organisms proportionally placed on resize.
    for (const o of this.organisms) {
      o.x = clamp(o.x * sx, 40, width - 40);
      o.y = clamp(o.y * sy, 40, height - 40);
    }
  }

  setMode(mode: ViewMode) {
    this.mode = mode;
  }

  getById(id: string): Organism | undefined {
    return this.byId.get(id);
  }

  /**
   * Advance the simulation by dt (in ~frames, normalized to 60fps).
   * draggedId is excluded from steering so the user fully controls it.
   */
  step(dt: number, selectedId: string | null, draggedId: string | null) {
    const tempo = MODE_TEMPO[this.mode];
    const orgs = this.organisms;

    for (const o of orgs) {
      const m = o.motion;
      o.wanderAngle += (Math.sin(o.seed + o.pulsePhase) * 0.04 + 0.015) * dt;
      o.pulsePhase += 0.018 * dt;
      o.spinPhase += (0.003 + o.joyFactor * 0.003) * dt;
      o.swayPhase += m.swaySpeed * tempo * dt;

      if (o.idea.id === draggedId) continue;

      let ax = 0;
      let ay = 0;

      // --- Wander: expressive ideas (high joy) roam more freely; each species
      // has its own restlessness so archetypes feel distinct.
      const wanderStrength = 0.04 * o.joyFactor * m.restless * tempo;
      ax += Math.cos(o.wanderAngle) * wanderStrength;
      ay += Math.sin(o.wanderAngle * 0.9) * wanderStrength;

      // --- Species sway: a signature oscillation (lateral / vertical / orbital).
      ax += Math.cos(o.swayPhase) * m.swayX * tempo;
      ay += Math.sin(o.swayPhase * 1.3 + o.seed) * m.swayY * tempo;

      // --- Separation: gently avoid crowding everyone.
      for (const other of orgs) {
        if (other === o) continue;
        const d = distance(o.x, o.y, other.x, other.y);
        const minGap = o.radius + other.radius + 14;
        if (d > 0 && d < minGap) {
          const push = (minGap - d) / minGap;
          ax += ((o.x - other.x) / d) * push * 0.5;
          ay += ((o.y - other.y) / d) * push * 0.5;
        }
      }

      // --- Cohesion: high-synergy ideas drift toward related organisms.
      if (o.synergyFactor > 0.05 && o.idea.adjacentNodes.length) {
        let cx = 0;
        let cy = 0;
        let n = 0;
        for (const id of o.idea.adjacentNodes) {
          const target = this.byId.get(id);
          if (!target) continue;
          cx += target.x;
          cy += target.y;
          n++;
        }
        if (n > 0) {
          cx /= n;
          cy /= n;
          const d = distance(o.x, o.y, cx, cy);
          // Keep a comfortable schooling radius, don't collapse to a point.
          if (d > 120) {
            ax += ((cx - o.x) / d) * 0.06 * o.synergyFactor * tempo;
            ay += ((cy - o.y) / d) * 0.06 * o.synergyFactor * tempo;
          }
        }
      }

      // --- Depth bias: dormant ideas sink and laze; active ideas float mid.
      const targetY = this.height * o.depthBias;
      ay += (targetY - o.y) * 0.00025 * tempo;
      if (o.idea.status === "dormant") {
        ax *= 0.6;
        ay *= 0.6;
      }

      // --- Selected organism eases toward calm, centered hovering.
      if (o.idea.id === selectedId) {
        ax *= 0.5;
        ay *= 0.5;
      }

      // Complexity adds inertia; species agility tunes how readily it steers.
      const responsiveness = (1 / o.mass) * o.motion.agility;
      o.vx += ax * responsiveness;
      o.vy += ay * responsiveness;

      // Speed envelope from momentum + tempo + species speed.
      const maxSpeed = (0.32 + o.speedFactor * 0.5) * o.motion.speed * tempo;
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > maxSpeed) {
        o.vx = (o.vx / sp) * maxSpeed;
        o.vy = (o.vy / sp) * maxSpeed;
      }

      // Gentle damping for a liquid feel.
      o.vx *= 0.985;
      o.vy *= 0.985;

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      this.containSoft(o);
    }
  }

  /** Soft-bounce containment with margins, no hard walls. */
  private containSoft(o: Organism) {
    const m = o.radius + 18;
    if (o.x < m) {
      o.vx += (m - o.x) * 0.01;
    } else if (o.x > this.width - m) {
      o.vx -= (o.x - (this.width - m)) * 0.01;
    }
    if (o.y < m) {
      o.vy += (m - o.y) * 0.01;
    } else if (o.y > this.height - m) {
      o.vy -= (o.y - (this.height - m)) * 0.01;
    }
    o.x = clamp(o.x, 8, this.width - 8);
    o.y = clamp(o.y, 8, this.height - 8);
  }

  /** Return the topmost organism under a point, or null. */
  hitTest(px: number, py: number): Organism | null {
    let found: Organism | null = null;
    // iterate forward; later (drawn-on-top) wins ties.
    for (const o of this.organisms) {
      const r = o.radius + 8;
      if (distance(px, py, o.x, o.y) <= r) found = o;
    }
    return found;
  }

  /** Find the closest other organism to a given one within range. */
  nearestTo(o: Organism, maxDist: number): Organism | null {
    let best: Organism | null = null;
    let bestD = maxDist;
    for (const other of this.organisms) {
      if (other === o) continue;
      const d = distance(o.x, o.y, other.x, other.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }
}
