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

const FILTERS: { key: FilterKey; label: string; shortLabel: string }[] = [
  { key: "highSynergy", label: "High Synergy", shortLabel: "Synergy" },
  { key: "fastToBuild", label: "Fast to Build", shortLabel: "Fast" },
  { key: "weird", label: "Weird", shortLabel: "Weird" },
  { key: "monetizable", label: "Monetizable", shortLabel: "Revenue" },
  { key: "dormant", label: "Dormant", shortLabel: "Dormant" },
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
    <div className="relative flex items-center rounded-full border border-slate-line/60 bg-navy-900/50 p-0.5 md:p-1">
      {modes.map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className="focus-ring relative z-10 min-h-[34px] rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors duration-300 md:min-h-0 md:px-3.5 md:py-1 md:text-xs"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={{ type: "spring", stiffness: 360, damping: 30 }}
                className="absolute inset-0 -z-10 rounded-full border border-teal/40 bg-teal/10 shadow-[0_0_18px_-8px_rgba(0,217,181,0.8)]"
              />
            )}
            <span
              className={
                active
                  ? "text-teal"
                  : "text-slate-mute transition-colors hover:text-slate-300"
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
    <header className="relative z-20 flex flex-col gap-2.5 border-b border-slate-line/50 bg-navy-950/80 px-4 py-3 backdrop-blur-xl md:gap-4 md:px-7 md:py-4">
      {/* Faint separating glow */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-teal/15 to-transparent" />

      {/* Top row — identity + controls */}
      <div className="flex items-center gap-3">
        {/* Logo mark */}
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center md:h-10 md:w-10">
          <span className="absolute inset-0 rounded-full border border-teal/30" />
          <span className="absolute inset-[4px] rounded-full border border-amber/25 md:inset-[5px]" />
          <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_12px_2px_rgba(0,217,181,0.7)] animate-pulse-soft" />
        </div>

        {/* Brand title */}
        <div className="leading-tight">
          <h1 className="font-grotesk text-[16px] font-semibold tracking-tight text-slate-50 md:text-[19px]">
            Idea Aquarium
          </h1>
          <p className="hidden text-xs tracking-wide text-slate-mute md:block">
            A living habitat for venture concepts
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search — desktop only */}
        <div className="group relative hidden w-full max-w-[220px] md:block lg:max-w-xs">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-mute transition-colors group-focus-within:text-teal"
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
            placeholder="Search…"
            className="w-full rounded-full border border-slate-line/60 bg-navy-900/50 py-2 pl-10 pr-3 text-sm text-slate-100 outline-none transition-colors duration-300 placeholder:text-slate-mute focus:border-teal/40 focus:bg-navy-900/70"
          />
        </div>

        {/* Mode toggle */}
        <ModeToggle mode={mode} onModeChange={onModeChange} />

        {/* Spawn button */}
        <motion.button
          type="button"
          onClick={onSpawn}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
          className="focus-ring group flex min-h-[36px] items-center gap-1.5 rounded-full border border-teal/50 bg-teal/10 px-3 py-2 text-[11px] font-semibold text-teal transition-colors duration-300 hover:bg-teal/20 hover:shadow-[0_0_26px_-6px_rgba(0,217,181,0.8)] md:min-h-0 md:gap-2 md:px-4 md:py-2 md:text-xs"
        >
          <svg
            className="h-3 w-3 transition-transform duration-300 group-hover:rotate-90 md:h-3.5 md:w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {/* Full label on desktop, icon-only on small mobile */}
          <span className="hidden sm:inline">Spawn</span>
          <span className="hidden md:inline"> Idea</span>
        </motion.button>
      </div>

      {/* Bottom row — filters + metrics */}
      <div className="flex items-center gap-3">
        {/* Filter chips — horizontally scrollable on mobile, wrapping on desktop */}
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 md:flex-wrap md:gap-2 md:pb-0 [&::-webkit-scrollbar]:hidden">
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

        {/* Metric pills — desktop only to keep mobile header lean */}
        <div className="hidden shrink-0 items-center divide-x divide-slate-line/40 rounded-xl border border-slate-line/40 bg-navy-900/30 md:flex">
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
