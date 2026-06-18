// Domain types for the Idea Aquarium ecosystem.

/** Lifecycle / activity state of an idea organism. */
export type IdeaStatus = "active" | "incubating" | "dormant" | "promoted";

/**
 * Strategic "species" classifications shown in the dossier. Each maps to a
 * soft-bodied biological `Archetype` (see below) that determines how the
 * organism is grown and animated in the tank.
 */
export type Species =
  | "Synthesizer"
  | "Conduit"
  | "Lattice"
  | "Drifter"
  | "Catalyst"
  | "Sentinel"
  | "Weaver";

/**
 * Biological body plan used by the simulation + canvas renderer. Each idea's
 * strategic `Species` is mapped to one of these soft-bodied lifeforms so the
 * tank reads as a living ecosystem rather than a set of symbols:
 *
 * - `drifter`  — medusa / jellyfish: pulsing bell + trailing tendrils
 * - `swarmer`  — plankton / larva: small, twitchy, finned, curious
 * - `floater`  — fragile inflated sac with internal glow pockets
 * - `hunter`   — cephalopod: tapered mantle, undulating fins, reaching arms
 */
export type Archetype = "drifter" | "swarmer" | "floater" | "hunter";

/** A single startup / MVP / creative concept living in the tank. */
export interface Idea {
  id: string;
  name: string;
  species: Species;
  description: string;

  // Strategic traits, all normalized 0..100.
  synergy: number;
  revenue: number;
  joy: number;
  complexity: number;
  novelty: number;
  momentum: number;

  status: IdeaStatus;
  tags: string[];

  /** ids of related ideas this organism gravitates toward. */
  adjacentNodes: string[];

  /** Speculative evolutions / pivots for this concept. */
  mutationIdeas: string[];
}

/** Filter chip identifiers used in the header. */
export type FilterKey =
  | "highSynergy"
  | "fastToBuild"
  | "weird"
  | "monetizable"
  | "dormant";

/** Global simulation tempo. */
export type ViewMode = "calm" | "active";

/** A proposed hybrid produced by dragging two organisms together. */
export interface HybridSuggestion {
  parentA: Idea;
  parentB: Idea;
  name: string;
  species: Species;
  rationale: string;
  blendedTraits: {
    synergy: number;
    revenue: number;
    joy: number;
    complexity: number;
    novelty: number;
    momentum: number;
  };
  tags: string[];
}
