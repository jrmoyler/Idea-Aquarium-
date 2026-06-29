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
    <div
      role="group"
      aria-label="Ecosystem tempo"
      className="relative flex items-center rounded-full border border-white/[0.07] bg-navy-800/60 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {modes.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            aria-pressed={active}
            aria-label={`${m} tempo`}
            className="focus-ring relative z-10 rounded-full px-3.5 py-1 text-xs font-medium capitalize transition-colors duration-300"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
                className="absolute inset-0 -z-10 rounded-full border border-teal/40 bg-teal/15 shadow-[0_0_18px_-6px_rgba(34,211,197,0.8)]"
              />
            )}
            <span
              className={
                active
                  ? "text-teal-glow"
                  : "text-slate-mute transition-colors hover:text-slate-ink"
              }
            >
              {m}
            </span>
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
    <header className="relative z-20 flex flex-col gap-4 border-b border-white/[0.06] bg-navy-900/70 px-5 py-4 backdrop-blur-xl lg:px-7">
      {/* Faint separating glow below the chrome. */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-teal/30 to-transparent" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Identity */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-10 w-10 items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 rounded-full border border-teal/30" />
            <span className="absolute inset-[5px] rounded-full border border-amber/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_12px_2px_rgba(34,211,197,0.7)] animate-pulse-soft" />
          </div>
          <div className="leading-tight">
            <h1 className="font-grotesk text-[19px] font-semibold tracking-tight text-slate-ink">
              Idea Aquarium
            </h1>
            <p className="text-xs tracking-wide text-slate-mute">
              A living habitat for venture concepts
            </p>
          </div>
        </div>

        {/* Search + actions */}
        <div className="flex min-w-[300px] flex-1 items-center justify-end gap-3">
          <div className="group relative w-full max-w-xs">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-mute transition-colors group-focus-within:text-teal"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search the ecosystem…"
              aria-label="Search the ecosystem"
              className="focus-ring w-full rounded-full border border-white/[0.07] bg-navy-800/60 py-2 pl-10 pr-3 text-sm text-slate-ink transition-colors duration-300 placeholder:text-slate-mute hover:border-white/[0.12] focus:border-teal/50 focus:bg-navy-800/90"
            />
          </div>

          <ModeToggle mode={mode} onModeChange={onModeChange} />

          <motion.button
            type="button"
            onClick={onSpawn}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="focus-ring group flex shrink-0 items-center gap-2 rounded-full border border-teal/50 bg-teal/15 px-4 py-2 text-xs font-semibold text-teal-glow transition-colors duration-300 hover:bg-teal/25 hover:shadow-[0_0_26px_-6px_rgba(34,211,197,0.8)]"
          >
            <svg
              className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-90"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Spawn New Idea
          </motion.button>
        </div>
      </div>

      {/* Filters + metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex items-center divide-x divide-white/[0.06] rounded-xl border border-white/[0.06] bg-navy-800/40">
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
