import { useCallback, useMemo, useState } from "react";
import { AquariumCanvas } from "./components/AquariumCanvas";
import { Header } from "./components/Header";
import { IdeaPanel } from "./components/IdeaPanel";
import { IDEAS } from "./data/ideas";
import { makeHybrid } from "./lib/hybrid";
import { spawnIdea } from "./lib/spawn";
import { matchesFilter, matchesQuery } from "./lib/utils";
import type { FilterKey, HybridSuggestion, Idea, ViewMode } from "./types";

const ALL_FILTERS: FilterKey[] = [
  "highSynergy",
  "fastToBuild",
  "weird",
  "monetizable",
  "dormant",
];

export default function App() {
  const [ideas, setIdeas] = useState<Idea[]>(IDEAS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [mode, setMode] = useState<ViewMode>("calm");
  const [hybrid, setHybrid] = useState<HybridSuggestion | null>(null);

  const ideaById = useCallback(
    (id: string) => ideas.find((i) => i.id === id),
    [ideas],
  );

  const selected = useMemo(
    () => (selectedId ? (ideaById(selectedId) ?? null) : null),
    [selectedId, ideaById],
  );

  // Ideas passing both the search query and every active filter.
  const matchingIds = useMemo(() => {
    const set = new Set<string>();
    for (const idea of ideas) {
      if (!matchesQuery(idea, query)) continue;
      let pass = true;
      for (const f of activeFilters) {
        if (!matchesFilter(idea, f)) {
          pass = false;
          break;
        }
      }
      if (pass) set.add(idea.id);
    }
    return set;
  }, [ideas, query, activeFilters]);

  const filtersActive = activeFilters.size > 0 || query.trim().length > 0;

  const filterCounts = useMemo(() => {
    const counts = {} as Record<FilterKey, number>;
    for (const key of ALL_FILTERS) {
      counts[key] = ideas.filter((i) => matchesFilter(i, key)).length;
    }
    return counts;
  }, [ideas]);

  // Ecosystem metrics.
  const ecosystem = useMemo(() => {
    const total = ideas.length;
    const avg = (sel: (i: Idea) => number) =>
      total === 0
        ? 0
        : Math.round(ideas.reduce((s, i) => s + sel(i), 0) / total);

    const speciesCounts = new Map<string, number>();
    for (const i of ideas)
      speciesCounts.set(i.species, (speciesCounts.get(i.species) ?? 0) + 1);
    const topSpecies =
      [...speciesCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // "Active clusters": connected components among high-synergy adjacencies.
    const clusters = countClusters(ideas);

    return {
      total,
      avgSynergy: avg((i) => i.synergy),
      avgMomentum: avg((i) => i.momentum),
      topSpecies,
      promoted: ideas.filter((i) => i.status === "promoted").length,
      dormant: ideas.filter((i) => i.status === "dormant").length,
      clusters,
    };
  }, [ideas]);

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSpawn = useCallback(() => {
    setIdeas((prev) => {
      const fresh = spawnIdea(prev);
      // Select after the organism is birthed in the simulation.
      requestAnimationFrame(() => setSelectedId(fresh.id));
      return [...prev, fresh];
    });
  }, []);

  const handlePromote = useCallback((idea: Idea) => {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === idea.id
          ? { ...i, status: "promoted", momentum: Math.min(100, i.momentum + 6) }
          : i,
      ),
    );
  }, []);

  const handleHybrid = useCallback((a: Idea, b: Idea) => {
    if (a.id === b.id) return;
    setHybrid(makeHybrid(a, b));
  }, []);

  const handleCrossbreed = useCallback(
    (idea: Idea) => {
      // Crossbreed with the strongest adjacent node.
      const partner = idea.adjacentNodes
        .map(ideaById)
        .filter((x): x is Idea => Boolean(x))
        .sort((a, b) => b.synergy - a.synergy)[0];
      if (partner) setHybrid(makeHybrid(idea, partner));
    },
    [ideaById],
  );

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    setHybrid(null);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-navy-950 text-slate-100">
      <Header
        query={query}
        onQueryChange={setQuery}
        activeFilters={activeFilters}
        filterCounts={filterCounts}
        onToggleFilter={toggleFilter}
        mode={mode}
        onModeChange={setMode}
        onSpawn={handleSpawn}
        metrics={{
          organisms: ecosystem.total,
          clusters: ecosystem.clusters,
          topSpecies: ecosystem.topSpecies,
        }}
      />

      <main className="relative flex flex-1 gap-5 overflow-hidden p-5">
        {/* Aquarium viewport (hero) */}
        <section className="relative flex-1 overflow-hidden rounded-2xl border border-slate-line/40 bg-navy-950 shadow-panel">
          {/* Soft inner frame so the tank reads as a contained instrument. */}
          <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-white/[0.03]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-teal/25 to-transparent" />
          <AquariumCanvas
            ideas={ideas}
            selectedId={selectedId}
            matchingIds={matchingIds}
            filtersActive={filtersActive}
            mode={mode}
            onSelect={handleSelect}
            onHybrid={handleHybrid}
          />
          {/* Corner readout */}
          <div className="pointer-events-none absolute bottom-5 left-6 z-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest2 text-slate-mute">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-soft" />
              Live Simulation
            </span>
            <span className="text-slate-line">/</span>
            <span className="capitalize">{mode} tempo</span>
          </div>
        </section>

        {/* Intelligence panel */}
        <IdeaPanel
          selected={selected}
          hybrid={hybrid}
          ideaById={ideaById}
          ecosystem={ecosystem}
          onPromote={handlePromote}
          onCrossbreed={handleCrossbreed}
          onDismissHybrid={() => setHybrid(null)}
        />
      </main>
    </div>
  );
}

/** Count connected components among ideas linked by adjacency (synergy web). */
function countClusters(ideas: Idea[]): number {
  const ids = new Set(ideas.map((i) => i.id));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const i of ideas) parent.set(i.id, i.id);
  for (const i of ideas) {
    for (const adj of i.adjacentNodes) {
      if (ids.has(adj)) union(i.id, adj);
    }
  }
  const roots = new Set<string>();
  for (const i of ideas) roots.add(find(i.id));
  return roots.size;
}
