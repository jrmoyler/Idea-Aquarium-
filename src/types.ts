// Domain types for the Idea Aquarium ecosystem.

/** Lifecycle / activity state of an idea organism. */
export type IdeaStatus = "active" | "incubating" | "dormant" | "promoted";

/**
 * Abstract "species" classifications. These drive subtle visual archetypes in
 * the simulation (body geometry, tail style, particle behavior) rather than
 * literal creatures.
 */
export type Species =
  | "Synthesizer"
  | "Conduit"
  | "Lattice"
  | "Drifter"
  | "Catalyst"
  | "Sentinel"
  | "Weaver";

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
