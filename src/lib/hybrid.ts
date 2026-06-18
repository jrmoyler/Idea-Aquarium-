import type { HybridSuggestion, Idea, Species } from "../types";
import { hashString, mulberry32 } from "./utils";

/** Pick the dominant species when two ideas merge. */
function blendSpecies(a: Species, b: Species, pick: number): Species {
  return pick < 0.5 ? a : b;
}

function portmanteau(a: string, b: string): string {
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  const head = wordsA[0];
  const tail = wordsB[wordsB.length - 1];
  if (head.toLowerCase() === tail.toLowerCase()) return `${head} ${wordsB[0]}`;
  return `${head} ${tail}`;
}

/** Average two traits with a slight novelty/synergy lift for emergent value. */
function blend(x: number, y: number, lift = 0): number {
  return Math.min(100, Math.round((x + y) / 2 + lift));
}

/**
 * Produce a speculative hybrid from two parent ideas. Deterministic given the
 * pair so the same crossbreed always reads the same way.
 */
export function makeHybrid(a: Idea, b: Idea): HybridSuggestion {
  const rng = mulberry32(hashString(a.id + "::" + b.id));
  const species = blendSpecies(a.species, b.species, rng());

  const blendedTraits = {
    synergy: blend(a.synergy, b.synergy, 6),
    revenue: blend(a.revenue, b.revenue, 2),
    joy: blend(a.joy, b.joy),
    complexity: blend(a.complexity, b.complexity, 4),
    novelty: blend(a.novelty, b.novelty, 8),
    momentum: blend(a.momentum, b.momentum),
  };

  const tagPool = Array.from(new Set([...a.tags, ...b.tags]));
  const tags = tagPool.slice(0, 4);

  const rationale = buildRationale(a, b, blendedTraits.synergy);

  return {
    parentA: a,
    parentB: b,
    name: portmanteau(a.name, b.name),
    species,
    rationale,
    blendedTraits,
    tags,
  };
}

function buildRationale(a: Idea, b: Idea, synergy: number): string {
  const lead =
    synergy >= 85
      ? "Exceptional fit"
      : synergy >= 70
        ? "Strong overlap"
        : "Speculative pairing";
  const aFocus = a.tags[0] ?? a.species.toLowerCase();
  const bFocus = b.tags[0] ?? b.species.toLowerCase();
  return `${lead}: fuses ${a.name}'s ${aFocus} core with ${b.name}'s ${bFocus} edge to open a wedge neither could reach alone.`;
}
