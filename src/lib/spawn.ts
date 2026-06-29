import type { Idea, Species } from "../types";

const PREFIXES = [
  "Nimbus",
  "Vector",
  "Cinder",
  "Halcyon",
  "Obsidian",
  "Meridian",
  "Solace",
  "Vesper",
  "Cobalt",
  "Helix",
  "Quill",
  "Strata",
];
const SUFFIXES = [
  "Engine",
  "Loom",
  "Harbor",
  "Forge",
  "Grid",
  "Lab",
  "Reef",
  "Mesh",
  "Vault",
  "Field",
  "Relay",
  "Studio",
];

const SPECIES: Species[] = [
  "Synthesizer",
  "Conduit",
  "Lattice",
  "Drifter",
  "Catalyst",
  "Sentinel",
  "Weaver",
];

const TAG_POOL = [
  "AI",
  "MCP",
  "infra",
  "automation",
  "dashboard",
  "memory",
  "experimental",
  "creative-coding",
  "venture-studio",
  "developer",
  "weird",
  "monetizable",
];

const DESCRIPTORS = [
  "An emergent concept still finding its shape in the tank.",
  "A freshly spawned organism with untested but promising instincts.",
  "A raw signal crystallizing into a venture worth watching.",
  "A nascent idea probing for adjacent nodes to school with.",
  "A speculative play seeded from the lab's ambient patterns.",
];

const MUTATIONS = [
  "Sharpen the wedge to a single high-intent user",
  "Bundle with an adjacent organism for distribution",
  "Strip to a one-screen MVP and ship this week",
  "Reframe around a recurring revenue ritual",
  "Open-source the core, monetize the orchestration",
  "Pair with a memory layer for stickiness",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

/** Pull `count` distinct random items from a pool without mutating it. */
function sample<T>(pool: T[], count: number): T[] {
  const copy = pool.slice();
  const out: T[] = [];
  while (out.length < count && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

/**
 * Each species has a loose temperament so spawned traits feel coherent rather
 * than uniformly random — a Catalyst should read scrappy and high-momentum, a
 * Lattice methodical and complex, etc. Values are soft centres, not hard rules.
 */
const SPECIES_BIAS: Record<
  Species,
  Partial<Record<"synergy" | "revenue" | "joy" | "complexity" | "novelty" | "momentum", number>>
> = {
  Synthesizer: { synergy: 12, novelty: 8 },
  Conduit: { synergy: 16, revenue: 8, momentum: 6 },
  Lattice: { complexity: 16, synergy: 8, momentum: -6 },
  Drifter: { joy: 12, novelty: 10, revenue: -8, momentum: -8 },
  Catalyst: { momentum: 16, joy: 8, complexity: -10, novelty: 6 },
  Sentinel: { revenue: 12, complexity: 8, joy: -6 },
  Weaver: { synergy: 14, joy: 6, novelty: 6 },
};

/** Generate a fresh, non-placeholder idea for the Spawn New Idea action. */
export function spawnIdea(existing: Idea[]): Idea {
  const name = `${pick(PREFIXES)} ${pick(SUFFIXES)}`;
  const id = `spawn-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
  const species = pick(SPECIES);
  const bias = SPECIES_BIAS[species];

  // 2–3 distinct, on-theme tags.
  const tags = sample(TAG_POOL, rand(2, 3));

  // Attach to a couple of existing high-synergy nodes so it joins the web and
  // immediately has kin to school with. Falls back gracefully on an empty tank.
  const adjacentNodes = sample(
    existing
      .slice()
      .sort((a, b) => b.synergy - a.synergy)
      .slice(0, 6),
    Math.min(2, existing.length),
  ).map((i) => i.id);

  const mutationIdeas = sample(MUTATIONS, 3);

  // Apply species temperament to softly-bounded random traits, then clamp.
  const t = (base: number, key: keyof typeof bias) =>
    Math.max(20, Math.min(98, base + (bias[key] ?? 0)));

  return {
    id,
    name,
    species,
    description: pick(DESCRIPTORS),
    synergy: t(rand(40, 86), "synergy"),
    revenue: t(rand(34, 82), "revenue"),
    joy: t(rand(45, 92), "joy"),
    complexity: t(rand(32, 80), "complexity"),
    novelty: t(rand(48, 92), "novelty"),
    // Fresh ideas arrive with energy — they enter the tank lively.
    momentum: t(rand(60, 94), "momentum"),
    status: "incubating",
    tags,
    adjacentNodes,
    mutationIdeas,
  };
}
