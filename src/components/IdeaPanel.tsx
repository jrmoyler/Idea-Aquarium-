import { AnimatePresence, motion } from "framer-motion";
import type { HybridSuggestion, Idea } from "../types";
import { traitLabel } from "../lib/utils";

interface IdeaPanelProps {
  selected: Idea | null;
  hybrid: HybridSuggestion | null;
  ideaById: (id: string) => Idea | undefined;
  ecosystem: {
    total: number;
    avgSynergy: number;
    avgMomentum: number;
    topSpecies: string;
    promoted: number;
    dormant: number;
  };
  onPromote: (idea: Idea) => void;
  onCrossbreed: (idea: Idea) => void;
  onDismissHybrid: () => void;
}

type TraitKey =
  | "synergy"
  | "revenue"
  | "joy"
  | "complexity"
  | "novelty"
  | "momentum";

const TRAIT_META: { key: TraitKey; label: string; accent: "teal" | "amber" }[] =
  [
    { key: "synergy", label: "Synergy", accent: "teal" },
    { key: "revenue", label: "Revenue", accent: "amber" },
    { key: "joy", label: "Joy", accent: "teal" },
    { key: "complexity", label: "Complexity", accent: "amber" },
    { key: "novelty", label: "Novelty", accent: "teal" },
    { key: "momentum", label: "Momentum", accent: "teal" },
  ];

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function TraitBar({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: number;
  accent: "teal" | "amber";
  delay: number;
}) {
  const fill =
    accent === "teal"
      ? "linear-gradient(90deg, rgba(0,217,181,0.45), #00D9B5)"
      : "linear-gradient(90deg, rgba(212,168,67,0.4), #D4A843)";
  const glow =
    accent === "teal"
      ? "0 0 12px -2px rgba(0,217,181,0.75)"
      : "0 0 12px -2px rgba(212,168,67,0.7)";
  const textColor = accent === "teal" ? "text-teal" : "text-amber";
  const qualLabel = traitLabel(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium tracking-wide text-slate-200 md:text-[13px]">
          {label}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-mute/80">
            {qualLabel}
          </span>
          <span
            className={`w-7 text-right font-grotesk text-[13px] font-semibold tabular-nums md:text-sm ${textColor}`}
          >
            {value}
          </span>
        </span>
      </div>
      {/* Track — slightly taller, with an inset shadow for a carved look */}
      <div className="h-[6px] overflow-hidden rounded-full bg-navy-800/70 ring-1 ring-inset ring-white/[0.04]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: fill, boxShadow: glow }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.85, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

/** Gradient-ruled section header — label + fading line gives a lab-schematic look. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center gap-3">
      <p className="label-eyebrow shrink-0">{children}</p>
      <div className="h-px flex-1 bg-gradient-to-r from-slate-line/50 to-transparent" />
    </div>
  );
}

function StatusBadge({ status }: { status: Idea["status"] }) {
  const map: Record<Idea["status"], string> = {
    active: "border-teal/30 text-teal bg-teal/5",
    incubating: "border-amber/30 text-amber bg-amber/5",
    dormant: "border-slate-mute/30 text-slate-mute bg-slate-mute/5",
    promoted: "border-teal/50 text-teal bg-teal/10",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${map[status]}`}
    >
      {status}
    </span>
  );
}

/** Terminal instrument header — catalog ID, sequence ref, and live indicator. */
function PaneMeta({ id }: { id: string }) {
  return (
    <div className="mb-5 pb-3" style={{ borderBottom: "1px solid rgba(22,34,63,0.9)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.28em] text-slate-mute/55">
            SPECIMEN
          </span>
          <span className="text-slate-line/60">/</span>
          <span className="truncate font-mono text-[10px] tracking-[0.14em] text-slate-300/45">
            {id}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-soft shadow-[0_0_6px_1px_rgba(0,217,181,0.45)]" />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-teal/55">
            Indexed
          </span>
        </div>
      </div>
    </div>
  );
}

function WelcomeState({
  ecosystem,
}: {
  ecosystem: IdeaPanelProps["ecosystem"];
}) {
  const stats: { label: string; value: string | number; accent: string }[] = [
    { label: "Organisms", value: ecosystem.total, accent: "text-teal" },
    { label: "Avg Synergy", value: ecosystem.avgSynergy, accent: "text-teal" },
    { label: "Avg Momentum", value: ecosystem.avgMomentum, accent: "text-teal" },
    { label: "Build Queue", value: ecosystem.promoted, accent: "text-teal" },
    { label: "Dormant", value: ecosystem.dormant, accent: "text-slate-300" },
    { label: "Top Species", value: ecosystem.topSpecies, accent: "text-amber" },
  ];
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="flex h-full flex-col"
    >
      <PaneMeta id="ECOSYSTEM" />

      <div className="flex-1">
        <SectionTitle>Intelligence Feed</SectionTitle>
        <h2 className="font-grotesk text-[22px] font-semibold leading-[1.18] tracking-tight text-slate-50 text-balance md:text-[26px] md:leading-[1.15]">
          The habitat is alive.
        </h2>
        <p className="mt-3 text-[12px] leading-relaxed text-slate-ink md:mt-3.5 md:text-[13px]">
          Every organism is a venture concept. Its motion, mass, and glow encode
          synergy, revenue, joy, complexity, novelty, and momentum. Select one to
          open its dossier — or drag two together to test a crossbreed.
        </p>

        {/* Ecosystem metrics grid */}
        <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-line/40 bg-navy-900/30 md:mt-8">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={[
                "p-3 md:p-4",
                i % 3 !== 2 ? "border-r border-slate-line/30" : "",
                i < 3 ? "border-b border-slate-line/30" : "",
              ].join(" ")}
            >
              <p className="label-eyebrow text-[8px] md:text-[10px]">{s.label}</p>
              <p
                className={`mt-2 font-grotesk text-base font-semibold tabular-nums md:mt-2.5 md:text-lg ${s.accent}`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2.5 rounded-xl border border-slate-line/40 bg-navy-900/30 p-4 md:mt-6">
        <p className="label-eyebrow">How to operate</p>
        <ul className="space-y-2 text-[12px] leading-snug text-slate-ink md:text-[13px]">
          {[
            "Tap an organism to inspect its strategic dossier",
            "Drag one near another to surface a hybrid",
            "Toggle Calm / Active to change ecosystem tempo",
          ].map((line, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-teal/60" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

function HybridCard({
  hybrid,
  onDismiss,
}: {
  hybrid: HybridSuggestion;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.99 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="relative mb-6 overflow-hidden rounded-xl border border-amber/30 bg-gradient-to-b from-amber/[0.08] to-transparent p-4 shadow-[0_0_40px_-18px_rgba(212,168,67,0.6)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/50 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow text-amber/80">Hybrid Candidate</p>
          <h3 className="mt-1.5 font-grotesk text-lg font-semibold text-amber-glow">
            {hybrid.name}
          </h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-amber/60">
            {hybrid.species} · {hybrid.parentA.name} × {hybrid.parentB.name}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={onDismiss}
          whileTap={{ scale: 0.9 }}
          className="focus-ring -mr-1 -mt-1 min-h-[36px] min-w-[36px] rounded-full p-1.5 text-slate-mute transition-colors hover:text-slate-100"
          aria-label="Dismiss hybrid"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </motion.button>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-ink md:text-[13px]">
        {hybrid.rationale}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ["Synergy", hybrid.blendedTraits.synergy],
            ["Novelty", hybrid.blendedTraits.novelty],
            ["Revenue", hybrid.blendedTraits.revenue],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            className="rounded-lg border border-amber/15 bg-navy-900/40 px-3 py-2.5"
          >
            <p className="text-[9px] uppercase tracking-wider text-slate-mute">
              {k}
            </p>
            <p className="mt-1 font-grotesk text-lg font-semibold tabular-nums text-amber-glow">
              {v}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function DossierState({
  idea,
  hybrid,
  ideaById,
  onPromote,
  onCrossbreed,
  onDismissHybrid,
}: {
  idea: Idea;
  hybrid: HybridSuggestion | null;
  ideaById: (id: string) => Idea | undefined;
  onPromote: (idea: Idea) => void;
  onCrossbreed: (idea: Idea) => void;
  onDismissHybrid: () => void;
}) {
  const best = idea.adjacentNodes
    .map(ideaById)
    .filter((x): x is Idea => Boolean(x))
    .sort((a, b) => b.synergy - a.synergy)[0];

  return (
    <motion.div
      key={idea.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="flex h-full flex-col"
    >
      <PaneMeta id={idea.id.toUpperCase()} />

      <div className="-mr-2 flex-1 overflow-y-auto pr-2 md:-mr-3 md:pr-3">
        <AnimatePresence>
          {hybrid && <HybridCard hybrid={hybrid} onDismiss={onDismissHybrid} />}
        </AnimatePresence>

        {/* Identity — classification header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-teal/75">
            {idea.species}
          </p>
          <StatusBadge status={idea.status} />
        </div>

        {/* Specimen name — prominent, anchored */}
        <h2 className="mt-2 font-grotesk text-[22px] font-semibold leading-[1.12] tracking-tight text-slate-50 md:mt-2.5 md:text-[26px] md:leading-[1.1]">
          {idea.name}
        </h2>

        {/* Description */}
        <p className="mt-3 text-[12px] leading-relaxed text-slate-ink md:text-[13px]">
          {idea.description}
        </p>

        {/* Strategic Traits */}
        <div className="mt-7 md:mt-8">
          <SectionTitle>Strategic Profile</SectionTitle>
          <div className="grid grid-cols-1 gap-3.5 md:gap-4">
            {TRAIT_META.map((t, i) => (
              <TraitBar
                key={t.key}
                label={t.label}
                value={idea[t.key]}
                accent={t.accent}
                delay={0.04 * i}
              />
            ))}
          </div>
        </div>

        {/* Signals */}
        <div className="mt-7 md:mt-8">
          <SectionTitle>Signals</SectionTitle>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {idea.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-line/60 bg-navy-800/40 px-3 py-1 text-[11px] text-slate-ink"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Best adjacent node */}
        {best && (
          <div className="mt-7 md:mt-8">
            <SectionTitle>Strongest Connection</SectionTitle>
            <div className="group flex items-center justify-between gap-3 rounded-xl border border-slate-line/50 bg-navy-900/40 p-4 transition-all duration-300 hover:border-teal/30 hover:bg-navy-900/60">
              <div className="flex items-center gap-3">
                {/* Connection indicator */}
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                  <span className="absolute inset-0 rounded-full border border-teal/20 transition-colors group-hover:border-teal/40" />
                  <span className="h-1.5 w-1.5 rounded-full bg-teal/50 transition-colors group-hover:bg-teal/80" />
                </div>
                <div>
                  <p className="font-grotesk text-sm font-medium text-slate-100">
                    {best.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-mute">
                    {best.species}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider text-slate-mute">
                  Synergy
                </p>
                <p className="font-grotesk text-xl font-semibold tabular-nums text-teal">
                  {best.synergy}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mutation Vectors */}
        <div className="mt-7 pb-1 md:mt-8">
          <SectionTitle>Mutation Vectors</SectionTitle>
          <div className="space-y-2">
            {idea.mutationIdeas.map((m, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-lg border border-slate-line/40 bg-navy-900/30 p-3 transition-all duration-300 hover:border-teal/25 hover:bg-navy-800/30 md:p-3.5"
              >
                <span className="mt-px shrink-0 font-mono text-[10px] font-semibold tabular-nums text-teal/50 md:text-[11px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[12px] leading-relaxed text-slate-ink md:text-[13px]">
                  {m}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA zone — fixed at bottom of panel */}
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-line/40 pt-4 md:mt-5 md:gap-2.5 md:pt-5">
        <motion.button
          type="button"
          onClick={() => onPromote(idea)}
          disabled={idea.status === "promoted"}
          whileHover={idea.status === "promoted" ? undefined : { scale: 1.012 }}
          whileTap={idea.status === "promoted" ? undefined : { scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          className="focus-ring flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-teal/50 bg-teal/15 py-3 text-sm font-semibold text-teal transition-colors duration-300 hover:bg-teal/25 hover:shadow-[0_0_30px_-10px_rgba(0,217,181,0.8)] disabled:cursor-not-allowed disabled:border-slate-line/50 disabled:bg-navy-800/40 disabled:text-slate-mute disabled:shadow-none"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m5 12 7-7 7 7M12 5v14" />
          </svg>
          {idea.status === "promoted"
            ? "In Build Queue"
            : "Promote to Build Queue"}
        </motion.button>
        <motion.button
          type="button"
          onClick={() => onCrossbreed(idea)}
          whileHover={{ scale: 1.012 }}
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          className="focus-ring flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-line/60 bg-navy-800/30 py-2.5 text-sm font-medium text-slate-ink transition-colors duration-300 hover:border-amber/40 hover:text-amber"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M7 4v6a5 5 0 0 0 5 5 5 5 0 0 0 5 5M17 4v6a5 5 0 0 1-5 5" />
          </svg>
          Crossbreed Idea
        </motion.button>
      </div>
    </motion.div>
  );
}

export function IdeaPanel(props: IdeaPanelProps) {
  const { selected, hybrid, ideaById, ecosystem } = props;
  return (
    /*
      Mobile:  flex-1 min-h-0  — takes remaining height below aquarium, scrolls internally
      Desktop: h-full w-[380px] shrink-0 — fixed-width right sidebar
    */
    <aside className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl shadow-panel md:h-full md:w-[380px] md:flex-none md:shrink-0 md:rounded-2xl">
      {/* Top accent lines */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/35 to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/[0.02] md:rounded-2xl" />

      <div className="flex h-full flex-col p-4 md:p-6">
        <AnimatePresence mode="wait">
          {selected ? (
            <DossierState
              key={selected.id}
              idea={selected}
              hybrid={hybrid}
              ideaById={ideaById}
              onPromote={props.onPromote}
              onCrossbreed={props.onCrossbreed}
              onDismissHybrid={props.onDismissHybrid}
            />
          ) : (
            <WelcomeState key="welcome" ecosystem={ecosystem} />
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
