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

/** Generate a fresh, non-placeholder idea for the Spawn New Idea action. */
export function spawnIdea(existing: Idea[]): Idea {
  const name = `${pick(PREFIXES)} ${pick(SUFFIXES)}`;
  const id = `spawn-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;

  const tags = Array.from(
    new Set([pick(TAG_POOL), pick(TAG_POOL), pick(TAG_POOL)]),
  );

  // Attach to a couple of existing high-synergy nodes so it joins the web.
  const adjacentNodes = existing
    .slice()
    .sort((a, b) => b.synergy - a.synergy)
    .slice(0, 6)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2)
    .map((i) => i.id);

  const mutationIdeas = MUTATIONS.slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return {
    id,
    name,
    species: pick(SPECIES),
    description: pick(DESCRIPTORS),
    synergy: rand(35, 90),
    revenue: rand(30, 88),
    joy: rand(40, 95),
    complexity: rand(30, 85),
    novelty: rand(45, 95),
    momentum: rand(55, 95),
    status: "incubating",
    tags,
    adjacentNodes,
    mutationIdeas,
  };
}
