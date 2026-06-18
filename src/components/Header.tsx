import { motion } from "framer-motion";
import type { FilterKey, ViewMode } from "../types";
import { FilterChip } from "./FilterChip";
import { MetricPill } from "./MetricPill";

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  activeFilters: Set<FilterKey>;
  filterCounts: Record<FilterKey, number>;
  onToggleFilter: (key: FilterKey) => void;
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  onSpawn: () => void;
  metrics: {
    organisms: number;
    clusters: number;
    topSpecies: string;
  };
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "highSynergy", label: "High Synergy" },
  { key: "fastToBuild", label: "Fast to Build" },
  { key: "weird", label: "Weird" },
  { key: "monetizable", label: "Monetizable" },
  { key: "dormant", label: "Dormant" },
];

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
}) {
  const modes: ViewMode[] = ["calm", "active"];
  return (
    <div className="relative flex items-center rounded-full border border-slate-line/70 bg-navy-900/60 p-0.5">
      {modes.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className="relative z-10 rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors duration-300"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full border border-teal/40 bg-teal/10"
              />
            )}
            <span className={active ? "text-teal" : "text-slate-mute"}>{m}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Header({
  query,
  onQueryChange,
  activeFilters,
  filterCounts,
  onToggleFilter,
  mode,
  onModeChange,
  onSpawn,
  metrics,
}: HeaderProps) {
  return (
    <header className="relative z-20 flex flex-col gap-4 border-b border-slate-line/60 bg-navy-950/70 px-6 py-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Identity */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-9 w-9 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-teal/40" />
            <span className="absolute inset-1.5 rounded-full border border-amber/30" />
            <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-glow animate-pulse-soft" />
          </div>
          <div className="leading-tight">
            <h1 className="font-grotesk text-lg font-semibold tracking-tight text-slate-50">
              Idea Aquarium
            </h1>
            <p className="text-xs text-slate-mute">
              A living habitat for venture concepts
            </p>
          </div>
        </div>

        {/* Search + actions */}
        <div className="flex flex-1 items-center justify-end gap-3 min-w-[280px]">
          <div className="relative w-full max-w-xs">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-mute"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search the ecosystem…"
              className="focus-ring w-full rounded-full border border-slate-line/70 bg-navy-900/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-mute"
            />
          </div>

          <ModeToggle mode={mode} onModeChange={onModeChange} />

          <button
            type="button"
            onClick={onSpawn}
            className="focus-ring group flex items-center gap-2 rounded-full border border-teal/50 bg-teal/10 px-4 py-2 text-xs font-semibold text-teal transition-all duration-300 hover:bg-teal/20 hover:shadow-[0_0_24px_-6px_rgba(0,217,181,0.7)]"
          >
            <svg
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Spawn New Idea
          </button>
        </div>
      </div>

      {/* Filters + metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              count={filterCounts[f.key]}
              active={activeFilters.has(f.key)}
              onClick={() => onToggleFilter(f.key)}
            />
          ))}
        </div>

        <div className="flex items-center divide-x divide-slate-line/60 rounded-xl border border-slate-line/50 bg-navy-900/40">
          <MetricPill label="Organisms" value={metrics.organisms} accent="teal" />
          <MetricPill
            label="Active Clusters"
            value={metrics.clusters}
            accent="amber"
          />
          <MetricPill label="Top Species" value={metrics.topSpecies} />
        </div>
      </div>
    </header>
  );
}
