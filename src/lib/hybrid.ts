import type { HybridSuggestion, Idea, Species } from "../types";
import { hashString, mulberry32 } from "./utils";

/**
 * Overall "vitality" of an idea — used to decide which parent's species
 * dominates the hybrid. The stronger, more momentous parent stamps its body
 * plan on the child, with a coin-flip nudge so equal pairings still vary.
 */
function vitality(i: Idea): number {
  return i.synergy + i.revenue + i.momentum + i.novelty * 0.5;
}

/** Pick the dominant species: the more vital parent, jittered for close calls. */
function blendSpecies(a: Idea, b: Idea, pick: number): Species {
  const va = vitality(a);
  const vb = vitality(b);
  const diff = (va - vb) / 200; // ~-1..1 for typical ranges
  // pick is 0..1; bias the threshold toward the stronger parent.
  return pick < 0.5 + diff * 0.5 ? a.species : b.species;
}

function portmanteau(a: string, b: string): string {
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  const head = wordsA[0];
  const tail = wordsB[wordsB.length - 1];
  if (head.toLowerCase() === tail.toLowerCase()) {
    // Same anchor word — borrow the other parent's lead instead of repeating.
    const alt = wordsB[0] !== head ? wordsB[0] : wordsA[wordsA.length - 1];
    return `${head} ${alt}`;
  }
  return `${head} ${tail}`;
}

/**
 * Blend two traits. A weighted average (favouring the stronger parent slightly)
 * plus an optional emergent `lift` — fusing ideas should unlock value neither
 * had alone, but never run away past 100.
 */
function blend(x: number, y: number, lift = 0): number {
  const hi = Math.max(x, y);
  const lo = Math.min(x, y);
  // 60/40 toward the stronger trait so the child keeps its best parent's edge.
  return Math.min(100, Math.round(hi * 0.6 + lo * 0.4 + lift));
}

/**
 * Produce a speculative hybrid from two parent ideas. Deterministic given the
 * pair so the same crossbreed always reads the same way.
 */
export function makeHybrid(a: Idea, b: Idea): HybridSuggestion {
  const rng = mulberry32(hashString(a.id + "::" + b.id));
  const species = blendSpecies(a, b, rng());

  const blendedTraits = {
    // Aligned ideas amplify synergy; the emergent lift scales with how related
    // they already are (shared tags / adjacency).
    synergy: blend(a.synergy, b.synergy, 6 + relatedness(a, b) * 6),
    revenue: blend(a.revenue, b.revenue, 2),
    joy: blend(a.joy, b.joy, 1),
    // Fusing adds moving parts — complexity creeps up.
    complexity: blend(a.complexity, b.complexity, 5),
    // The headline payoff of a crossbreed: genuinely novel combinations.
    novelty: blend(a.novelty, b.novelty, 9),
    momentum: blend(a.momentum, b.momentum),
  };

  // Prioritise shared tags (the common ground) then fill from each parent.
  const shared = a.tags.filter((t) => b.tags.includes(t));
  const tags = Array.from(new Set([...shared, ...a.tags, ...b.tags])).slice(0, 4);

  const rationale = buildRationale(a, b, blendedTraits, relatedness(a, b));

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

/** 0..1 measure of how related two ideas already are (shared tags + adjacency). */
function relatedness(a: Idea, b: Idea): number {
  const shared = a.tags.filter((t) => b.tags.includes(t)).length;
  const adjacent =
    a.adjacentNodes.includes(b.id) || b.adjacentNodes.includes(a.id) ? 1 : 0;
  const tagScore = Math.min(1, shared / 2);
  return Math.min(1, tagScore * 0.7 + adjacent * 0.5);
}

function buildRationale(
  a: Idea,
  b: Idea,
  traits: HybridSuggestion["blendedTraits"],
  related: number,
): string {
  const lead =
    traits.synergy >= 85
      ? "Exceptional fit"
      : traits.synergy >= 70
        ? "Strong overlap"
        : related > 0.4
          ? "Natural pairing"
          : "Speculative cross";
  const aFocus = a.tags[0] ?? a.species.toLowerCase();
  const bFocus = b.tags[0] ?? b.species.toLowerCase();
  // Highlight whichever blended trait came out most exceptional.
  const standout = topTrait(traits);
  return `${lead}: fuses ${a.name}'s ${aFocus} core with ${b.name}'s ${bFocus} edge — the cross spikes ${standout} and opens a wedge neither could reach alone.`;
}

/** Name the strongest blended trait for the rationale copy. */
function topTrait(traits: HybridSuggestion["blendedTraits"]): string {
  let best: keyof HybridSuggestion["blendedTraits"] = "novelty";
  let bestVal = -1;
  (Object.keys(traits) as (keyof HybridSuggestion["blendedTraits"])[]).forEach(
    (k) => {
      if (traits[k] > bestVal) {
        bestVal = traits[k];
        best = k;
      }
    },
  );
  return best;
}
