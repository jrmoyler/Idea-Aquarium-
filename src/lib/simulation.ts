import type { Idea, ViewMode } from "../types";
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

  // Animation phases (deterministic seeds keep motion coherent).
  wanderAngle: number;
  pulsePhase: number;
  spinPhase: number;
  seed: number;

  /** Transient render state, eased every frame. */
  hover: number; // 0..1
  selectGlow: number; // 0..1
  mergeGlow: number; // 0..1
}

export interface SimulationOptions {
  width: number;
  height: number;
  mode: ViewMode;
}

const MODE_TEMPO: Record<ViewMode, number> = {
  calm: 0.62,
  active: 1.15,
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
      wanderAngle: local() * Math.PI * 2,
      pulsePhase: local() * Math.PI * 2,
      spinPhase: local() * Math.PI * 2,
      seed,
      hover: 0,
      selectGlow: 0,
      mergeGlow: 0,
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
      o.wanderAngle += (Math.sin(o.seed + o.pulsePhase) * 0.05 + 0.02) * dt;
      o.pulsePhase += 0.02 * dt;
      o.spinPhase += (0.004 + o.joyFactor * 0.004) * dt;

      if (o.idea.id === draggedId) continue;

      let ax = 0;
      let ay = 0;

      // --- Wander: expressive ideas (high joy) roam more freely.
      const wanderStrength = 0.05 * o.joyFactor * tempo;
      ax += Math.cos(o.wanderAngle) * wanderStrength;
      ay += Math.sin(o.wanderAngle * 0.9) * wanderStrength;

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

      // Complexity adds inertia: heavy ideas turn slowly.
      const responsiveness = 1 / o.mass;
      o.vx += ax * responsiveness;
      o.vy += ay * responsiveness;

      // Speed envelope from momentum + tempo.
      const maxSpeed = (0.35 + o.speedFactor * 0.55) * tempo;
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
