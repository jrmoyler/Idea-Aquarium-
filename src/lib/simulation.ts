import type { Archetype, Idea, Species, ViewMode } from "../types";
import { ideaBaseColor } from "./color";
import { buildProfile, type RenderProfile } from "./organism-profile";
import { clamp, distance, hashString, lerpAngle, mulberry32 } from "./utils";
import { fbm1D } from "./noise";

/**
 * A live organism in the tank. Carries its source idea, soft-body physics, and
 * a precomputed biological "anatomy" (RenderProfile). Motion is driven by
 * muscular pulse propulsion + drag, not by following vector paths, so each
 * creature feels like it swims through a fluid medium.
 */
export interface Organism {
  idea: Idea;
  archetype: Archetype;
  profile: RenderProfile;

  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing direction; eases toward desired heading so turns lag (steering). */
  heading: number;

  radius: number;
  baseColor: string;

  // Behaviour tuning derived from traits.
  speedFactor: number; // momentum -> top speed
  mass: number; // complexity -> turn resistance + density
  joyFactor: number; // expressiveness of pulse + appendage motion
  synergyFactor: number; // social awareness / co-drifting
  depthBias: number; // dormant ideas settle lower
  thrustPower: number; // muscular contraction strength
  pulseRate: number; // contraction cadence (momentum)
  drag: number; // fluid damping
  buoyancy: number; // passive vertical drift

  // Animation phases.
  wanderAngle: number;
  pulsePhase: number; // muscular contraction cycle
  swayPhase: number; // appendage undulation
  seed: number;

  // Eased render state.
  contraction: number; // 0 relaxed .. 1 contracted (smoothed bell state)
  hover: number; // 0..1
  selectGlow: number; // 0..1
  mergeGlow: number; // 0..1 (legacy birth flash + merge candidate)
  resonance: number; // 0..1 shared bioluminescent attraction
  presence: number; // 1 full, < 1 when another organism holds focus

  // --- Per-individual character (seeded; some lazy, some busy). ---
  restlessness: number; // 0.6..1.4 personal activity multiplier
  cadenceJitter: number; // 0.85..1.15 personal pulse-tempo offset
  preferredDepth: number; // normalized 0..1 favourite station in the column
  startleCooldown: number; // seconds until this creature may dart again
  noisePhase: number; // private offset into vertical-current noise field

  // --- Smoothed behavioural state ---
  excitement: number; // 0 calm .. 1 darting (decays toward calm)
  wanderTurnVel: number; // current angular velocity of wanderAngle (inertia)
  bankLean: number; // -1..1 smoothed turn-rate, body leans into curves
  burstImpulse: number; // transient extra thrust from a startle dart (decays)
}

export interface SimulationOptions {
  width: number;
  height: number;
  mode: ViewMode;
}

/** Per-archetype movement signature — how each body plan swims. */
interface MotionProfile {
  pulseRate: number; // base contraction cadence
  thrust: number; // base impulse per contraction
  drag: number; // velocity retention per frame
  turn: number; // heading agility (0..1)
  wander: number; // exploratory restlessness
  buoyancy: number; // passive vertical drift (− rises, + sinks)
  burst: number; // how "pulsed" vs continuous the propulsion is (0..1)
}

const MOTION: Record<Archetype, MotionProfile> = {
  // Medusa: slow, elegant, strong single pulses then a long coast.
  drifter: { pulseRate: 0.05, thrust: 0.26, drag: 0.95, turn: 0.012, wander: 0.5, buoyancy: -0.004, burst: 1.0 },
  // Larva: fast, twitchy, frequent little tail beats; turns sharply.
  swarmer: { pulseRate: 0.14, thrust: 0.12, drag: 0.9, turn: 0.06, wander: 1.3, buoyancy: 0.0, burst: 0.85 },
  // Sac: barely propels; mostly buoyant drifting with rare contractions.
  floater: { pulseRate: 0.022, thrust: 0.12, drag: 0.965, turn: 0.01, wander: 0.35, buoyancy: -0.006, burst: 1.0 },
  // Cephalopod: smooth, intentional finning with steady forward intent.
  hunter: { pulseRate: 0.075, thrust: 0.17, drag: 0.93, turn: 0.03, wander: 0.6, buoyancy: 0.0, burst: 0.4 },
};

/**
 * Preferred station in the water column per body plan (0 = surface, 1 = floor).
 * Floaters and drifters hang high and bob; hunters cruise mid; swarmers roam a
 * little lower in loose shoals. Dormant ideas sink below this regardless.
 */
const ARCHETYPE_DEPTH: Record<Archetype, number> = {
  drifter: 0.34,
  swarmer: 0.52,
  floater: 0.28,
  hunter: 0.5,
};

/**
 * How readily each body plan startles into a quick dart (per-second base
 * probability, scaled by tempo + individual restlessness). Hunters and
 * swarmers twitch; serene drifters/floaters rarely do.
 */
const STARTLE_RATE: Record<Archetype, number> = {
  drifter: 0.018,
  swarmer: 0.12,
  floater: 0.01,
  hunter: 0.09,
};

/** Map a strategic Species to a soft-bodied biological body plan. */
export function archetypeForSpecies(species: Species): Archetype {
  switch (species) {
    case "Drifter":
    case "Synthesizer":
    case "Sentinel":
      return "drifter";
    case "Lattice":
      return "floater";
    case "Catalyst":
      return "swarmer";
    case "Conduit":
    case "Weaver":
      return "hunter";
    default: {
      const _never: never = species;
      return _never;
    }
  }
}

const MODE_TEMPO: Record<ViewMode, number> = {
  calm: 0.55,
  active: 1.0,
};

/**
 * Soft-bodied ecosystem. Creatures wander, separate, co-drift with related
 * ideas (synergy), and propel themselves with muscular pulses + fluid drag.
 */
export class Simulation {
  organisms: Organism[] = [];
  width: number;
  height: number;
  mode: ViewMode;

  private byId = new Map<string, Organism>();
  /** Accumulating clock (seconds·tempo) driving tank-wide vertical currents. */
  private currentTime = 0;

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
      const depthBias = idea.status === "dormant" ? 0.74 : 0.44;
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

  private createOrganism(idea: Idea, pos: { x: number; y: number }): Organism {
    const seed = hashString(idea.id);
    const local = mulberry32(seed);
    const revenue = idea.revenue / 100;
    const radius = 17 + revenue * 17 + (idea.complexity / 100) * 7;
    const depthBias = idea.status === "dormant" ? 0.74 : 0.44;
    const archetype = archetypeForSpecies(idea.species);
    const m = MOTION[archetype];

    // Per-individual character drawn from the seeded RNG so every creature has
    // its own temperament (lazy vs busy) yet stays deterministic per idea.
    const restlessness = 0.6 + local() * 0.8; // 0.6..1.4
    const cadenceJitter = 0.85 + local() * 0.3; // 0.85..1.15
    // Each archetype clusters around a preferred depth band, with individual
    // scatter, so the tank reads as a layered water column.
    const depthBand = ARCHETYPE_DEPTH[archetype];
    const preferredDepth = clamp(
      depthBand + (local() - 0.5) * 0.16,
      0.12,
      0.9,
    );

    return {
      idea,
      archetype,
      profile: buildProfile(idea, archetype, seed),
      x: pos.x,
      y: pos.y,
      vx: (local() - 0.5) * 0.4,
      vy: (local() - 0.5) * 0.4,
      heading: local() * Math.PI * 2,
      radius,
      baseColor: ideaBaseColor(idea.revenue),
      speedFactor: 0.45 + (idea.momentum / 100) * 1.2,
      mass: 0.6 + (idea.complexity / 100) * 1.4,
      joyFactor: 0.4 + (idea.joy / 100) * 1.6,
      synergyFactor: idea.synergy / 100,
      depthBias,
      thrustPower: m.thrust * (0.7 + (idea.momentum / 100) * 0.6),
      pulseRate: m.pulseRate * (0.7 + (idea.momentum / 100) * 0.7),
      drag: m.drag,
      buoyancy: m.buoyancy,
      wanderAngle: local() * Math.PI * 2,
      pulsePhase: local() * Math.PI * 2,
      swayPhase: local() * Math.PI * 2,
      seed,
      contraction: 0,
      hover: 0,
      selectGlow: 0,
      mergeGlow: 0,
      resonance: 0,
      presence: 1,
      restlessness,
      cadenceJitter,
      preferredDepth,
      startleCooldown: local() * 6,
      noisePhase: local() * 1000,
      excitement: 0,
      wanderTurnVel: (local() - 0.5) * 0.02,
      bankLean: 0,
      burstImpulse: 0,
    };
  }

  reconcile(ideas: Idea[]) {
    for (const idea of ideas) {
      const existing = this.byId.get(idea.id);
      if (existing) {
        existing.idea = idea;
        existing.archetype = archetypeForSpecies(idea.species);
        existing.depthBias = idea.status === "dormant" ? 0.74 : 0.44;
        existing.baseColor = ideaBaseColor(idea.revenue);
      } else {
        const o = this.createOrganism(idea, {
          x: this.width * 0.5 + (Math.random() - 0.5) * 80,
          y: this.height * 0.44 + (Math.random() - 0.5) * 80,
        });
        o.mergeGlow = 1; // brief birth flush
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
   * Advance the simulation. `draggedId` is excluded from steering (user-driven).
   * `mergeCandidateId` is pulled gently toward the dragged organism and syncs
   * its pulse — a behavioural attraction, never a drawn connector.
   */
  step(
    dt: number,
    selectedId: string | null,
    draggedId: string | null,
    mergeCandidateId: string | null,
  ) {
    const tempo = MODE_TEMPO[this.mode];
    const orgs = this.organisms;
    const dragged = draggedId ? this.byId.get(draggedId) : null;
    // Shared slow clock for tank-wide vertical currents.
    this.currentTime += dt;
    const ct = this.currentTime;

    for (const o of orgs) {
      const m = MOTION[o.archetype];
      const dormant = o.idea.status === "dormant";
      const slow = dormant ? 0.55 : 1;
      const selected = o.idea.id === selectedId;
      // A selected creature settles into a graceful hover; excitement fades.
      const composure = selected ? 0.45 : 1;

      // --- Decay transient states (per second).
      const decay = Math.exp(-dt * (selected ? 2.6 : 1.4));
      o.excitement *= decay;
      o.burstImpulse *= Math.exp(-dt * 3.2);
      if (o.startleCooldown > 0) o.startleCooldown -= dt;

      // --- Muscular cycle: drives propulsion AND the visible bell contraction.
      // Excitement quickens the cadence (a startled creature pulses faster).
      const cadence =
        o.pulseRate * o.cadenceJitter * (1 + o.excitement * 0.9);
      o.pulsePhase += cadence * tempo * slow * dt;
      o.swayPhase +=
        (0.02 + o.joyFactor * 0.02) * (1 + o.excitement * 0.6) * tempo * dt;

      // --- Wander with angular inertia: direction changes glide as S-curves
      // instead of a twitchy random walk. Noise nudges the turn *velocity*,
      // which is then integrated and gently damped.
      const wanderForce =
        fbm1D(o.seed * 0.01 + o.pulsePhase * 0.25 + o.noisePhase * 0.001, 2) *
        0.012 *
        m.wander *
        o.restlessness;
      o.wanderTurnVel = o.wanderTurnVel * 0.92 + wanderForce * dt * 60;
      o.wanderTurnVel = clamp(o.wanderTurnVel, -0.05, 0.05);
      o.wanderAngle += o.wanderTurnVel * tempo * composure * dt;

      // Smoothed contraction state for the renderer (0 relaxed .. 1 squeezed).
      const targetContract = clamp(Math.sin(o.pulsePhase) * 0.5 + 0.5, 0, 1);
      o.contraction += (targetContract - o.contraction) * 0.3;

      if (o.idea.id === draggedId) {
        // Dragged creatures are positioned by the pointer; still pulse visually.
        continue;
      }

      // --- Desired swim direction (steering), assembled as a soft vector.
      let dx = Math.cos(o.wanderAngle);
      let dy = Math.sin(o.wanderAngle * 0.85) * 0.7;

      // Separation + boids-lite schooling for swarmers (alignment + cohesion).
      let sepx = 0;
      let sepy = 0;
      let alignx = 0;
      let aligny = 0;
      let cohx = 0;
      let cohy = 0;
      let school = 0;
      let nearestGap = Infinity; // for near-collision startle
      const schooler = o.archetype === "swarmer";
      for (const other of orgs) {
        if (other === o) continue;
        const d = distance(o.x, o.y, other.x, other.y);
        const gap = o.radius + other.radius + 16;
        if (d > 0 && d < gap) {
          const push = (gap - d) / gap;
          sepx += ((o.x - other.x) / d) * push;
          sepy += ((o.y - other.y) / d) * push;
          if (d < nearestGap) nearestGap = d;
        }
        // Shoaling: swarmers loosely align + cohere with nearby same-archetype kin.
        if (schooler && other.archetype === "swarmer") {
          const reach = 150;
          if (d > 0 && d < reach) {
            alignx += Math.cos(other.heading);
            aligny += Math.sin(other.heading);
            cohx += other.x;
            cohy += other.y;
            school++;
          }
        }
      }
      dx += sepx * 1.2;
      dy += sepy * 1.2;

      if (school > 0) {
        // Alignment: match the shoal's average heading.
        const al = Math.hypot(alignx, aligny) || 1;
        dx += (alignx / al) * 0.5 * o.restlessness;
        dy += (aligny / al) * 0.5 * o.restlessness;
        // Cohesion: drift toward the shoal centroid when loosely spread.
        cohx /= school;
        cohy /= school;
        const cd = distance(o.x, o.y, cohx, cohy);
        if (cd > 60) {
          dx += ((cohx - o.x) / cd) * 0.45;
          dy += ((cohy - o.y) / cd) * 0.45;
        }
      }

      // Cohesion / social awareness: high-synergy ideas co-drift with kin.
      if (o.synergyFactor > 0.05 && o.idea.adjacentNodes.length) {
        let cx = 0;
        let cy = 0;
        let n = 0;
        for (const id of o.idea.adjacentNodes) {
          const t = this.byId.get(id);
          if (!t) continue;
          cx += t.x;
          cy += t.y;
          n++;
        }
        if (n > 0) {
          cx /= n;
          cy /= n;
          const d = distance(o.x, o.y, cx, cy);
          if (d > 120) {
            dx += ((cx - o.x) / d) * 0.9 * o.synergyFactor;
            dy += ((cy - o.y) / d) * 0.9 * o.synergyFactor;
          }
        }
      }

      // --- Depth-layered behaviour: each creature keeps station near its own
      // preferred band in the column; dormant ideas sink lower than that.
      const depthTarget = dormant
        ? Math.max(o.preferredDepth, o.depthBias)
        : o.preferredDepth;
      const targetY = this.height * depthTarget;
      dy += clamp((targetY - o.y) * 0.0045, -0.6, 0.6);

      // --- Edge anticipation: bank away from walls before reaching them, so
      // turns away read as intentional rather than a bounce.
      const lookahead = o.radius + 70;
      if (o.x < lookahead) dx += (1 - o.x / lookahead) * 0.8;
      else if (o.x > this.width - lookahead)
        dx -= (1 - (this.width - o.x) / lookahead) * 0.8;
      if (o.y < lookahead) dy += (1 - o.y / lookahead) * 0.7;
      else if (o.y > this.height - lookahead)
        dy -= (1 - (this.height - o.y) / lookahead) * 0.7;

      // Merge resonance: the candidate is gently drawn toward its suitor.
      if (o.idea.id === mergeCandidateId && dragged) {
        const d = distance(o.x, o.y, dragged.x, dragged.y) || 1;
        dx += ((dragged.x - o.x) / d) * 1.6;
        dy += ((dragged.y - o.y) / d) * 1.6;
        // Sync the pulse so the pair breathes together.
        o.pulsePhase = lerpAngle(o.pulsePhase, dragged.pulsePhase, 0.04);
      }

      // --- Startle / dart: a rare stochastic twitch in the heading direction,
      // plus a reflexive veer when another body crowds in very close.
      const crowded = nearestGap < o.radius * 0.9;
      if (!selected && o.startleCooldown <= 0) {
        const p =
          STARTLE_RATE[o.archetype] * o.restlessness * tempo * dt +
          (crowded ? 0.12 * dt * 60 : 0);
        // Deterministic-ish stochastic trigger from the noise field + phase.
        const r =
          (fbm1D(ct * 1.7 + o.seed * 0.013 + o.noisePhase, 3) + 1) * 0.5;
        if (r < p) {
          o.excitement = Math.min(1, o.excitement + 0.85);
          o.burstImpulse = 0.9 + o.restlessness * 0.4;
          o.startleCooldown = 1.6 + (1 - o.restlessness) * 2.2;
          if (crowded) {
            // Veer perpendicular to the crowding, away from the squeeze.
            o.wanderAngle += (sepx >= 0 ? 0.6 : -0.6) + sepy * 0.3;
          }
        }
      }

      // --- Turn heading toward desired direction (steering lag / inertia).
      const desired = Math.atan2(dy, dx);
      let turn = m.turn * (1 / Math.sqrt(o.mass)) * tempo;
      // Excitement sharpens turns (a dart commits quickly); selection calms.
      turn *= 1 + o.excitement * 0.8;
      if (selected) turn *= 0.55; // selected = calmer, composed hover
      const before = o.heading;
      o.heading = lerpAngle(o.heading, desired, clamp(turn, 0, 0.45));
      // Banking: record the smoothed turn rate so the body leans into curves.
      let dh = o.heading - before;
      dh = ((dh + Math.PI) % (Math.PI * 2)) - Math.PI;
      o.bankLean += (clamp(dh * 14, -1, 1) - o.bankLean) * 0.12;

      // --- Propulsion: muscular contraction launches the body forward, then
      // it coasts on drag. `burst` shapes pulse-like vs continuous swimming.
      const contractVel = Math.max(0, Math.cos(o.pulsePhase)); // upstroke = thrust
      const drive =
        (m.burst * contractVel + (1 - m.burst)) * o.thrustPower * o.restlessness;
      let thrust = (drive + o.burstImpulse * o.thrustPower * 1.6) * tempo * slow;
      if (selected) thrust *= 0.65;
      // Idle hovering: when calm + near station, ease off thrust so floaters
      // and the selected creature nearly hang in place, finning gently.
      const atStation = Math.abs(targetY - o.y) < this.height * 0.06;
      const idle =
        (o.archetype === "floater" ? 0.55 : 0.85) +
        (selected ? -0.25 : 0) +
        (atStation ? 0 : 0.1);
      thrust *= clamp(idle + o.excitement * 0.6, 0.3, 1.3);
      o.vx += Math.cos(o.heading) * thrust;
      o.vy += Math.sin(o.heading) * thrust;

      // Immediate separation nudge so bodies never visibly overlap.
      o.vx += sepx * 0.35 * tempo;
      o.vy += sepy * 0.35 * tempo;

      // --- Pulse-synced buoyancy: medusa/sac bodies rise a touch on the
      // contraction upstroke then sink slightly as they relax — real bell
      // locomotion. Layered over the passive buoyancy of the body plan.
      const bob =
        Math.cos(o.pulsePhase) * m.burst * 0.012 * (0.6 + o.joyFactor * 0.5);
      o.vy += (o.buoyancy - bob) * tempo * slow;

      // --- Gentle tank-wide vertical current: a slow fbm field that varies
      // across the width so the whole column drifts organically.
      const current =
        fbm1D(o.x * 0.002 + ct * 0.08, 2) * 0.02 +
        fbm1D(o.y * 0.0016 + ct * 0.05 + 50, 2) * 0.012;
      o.vy += current * tempo;
      o.vx += fbm1D(o.y * 0.002 + ct * 0.06 + 200, 2) * 0.012 * tempo;

      // Fluid drag — heavier for lazy bodies, lighter for darters.
      o.vx *= o.drag;
      o.vy *= o.drag;

      // Speed envelope from momentum + tempo (a startle dart raises the ceiling).
      const maxSpeed =
        (0.3 + o.speedFactor * 0.55) * (1 + o.excitement * 0.7) * tempo * slow;
      const sp = Math.hypot(o.vx, o.vy);
      if (sp > maxSpeed) {
        o.vx = (o.vx / sp) * maxSpeed;
        o.vy = (o.vy / sp) * maxSpeed;
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;

      this.containSoft(o);
    }
  }

  /** Soft containment with margins — currents nudge creatures back, no walls. */
  private containSoft(o: Organism) {
    const m = o.radius + 20;
    if (o.x < m) o.vx += (m - o.x) * 0.008;
    else if (o.x > this.width - m) o.vx -= (o.x - (this.width - m)) * 0.008;
    if (o.y < m) o.vy += (m - o.y) * 0.008;
    else if (o.y > this.height - m) o.vy -= (o.y - (this.height - m)) * 0.008;
    o.x = clamp(o.x, 8, this.width - 8);
    o.y = clamp(o.y, 8, this.height - 8);
  }

  /** Topmost organism under a point, or null. */
  hitTest(px: number, py: number): Organism | null {
    let found: Organism | null = null;
    for (const o of this.organisms) {
      const r = o.radius + 10;
      if (distance(px, py, o.x, o.y) <= r) found = o;
    }
    return found;
  }

  /** Closest other organism within range. */
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
