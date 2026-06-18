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

const TRAIT_META: {
  key: keyof Pick<
    Idea,
    "synergy" | "revenue" | "joy" | "complexity" | "novelty" | "momentum"
  >;
  label: string;
  accent: "teal" | "amber";
}[] = [
  { key: "synergy", label: "Synergy", accent: "teal" },
  { key: "revenue", label: "Revenue", accent: "amber" },
  { key: "joy", label: "Joy", accent: "teal" },
  { key: "complexity", label: "Complexity", accent: "amber" },
  { key: "novelty", label: "Novelty", accent: "teal" },
  { key: "momentum", label: "Momentum", accent: "amber" },
];

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
  const barColor = accent === "teal" ? "bg-teal" : "bg-amber";
  const textColor = accent === "teal" ? "text-teal" : "text-amber";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-ink">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-mute">
            {traitLabel(value)}
          </span>
          <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
            {value}
          </span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-navy-700/60">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="label-eyebrow mb-3">{children}</p>;
}

function StatusBadge({ status }: { status: Idea["status"] }) {
  const map: Record<Idea["status"], string> = {
    active: "border-teal/40 text-teal bg-teal/5",
    incubating: "border-amber/40 text-amber bg-amber/5",
    dormant: "border-slate-mute/40 text-slate-mute bg-slate-mute/5",
    promoted: "border-teal/60 text-teal bg-teal/10",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status]}`}
    >
      {status}
    </span>
  );
}

function WelcomeState({
  ecosystem,
}: {
  ecosystem: IdeaPanelProps["ecosystem"];
}) {
  const stats = [
    { label: "Organisms", value: ecosystem.total, accent: "text-teal" },
    { label: "Avg Synergy", value: ecosystem.avgSynergy, accent: "text-teal" },
    { label: "Avg Momentum", value: ecosystem.avgMomentum, accent: "text-amber" },
    { label: "In Build Queue", value: ecosystem.promoted, accent: "text-teal" },
    { label: "Dormant", value: ecosystem.dormant, accent: "text-slate-ink" },
    { label: "Top Species", value: ecosystem.topSpecies, accent: "text-amber" },
  ];
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.45 }}
      className="flex h-full flex-col"
    >
      <div className="flex-1">
        <SectionTitle>Intelligence Feed</SectionTitle>
        <h2 className="font-grotesk text-2xl font-semibold leading-tight text-slate-50 text-balance">
          The tank is alive.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-ink">
          Each organism is a venture concept — its motion, mass, and glow encode
          synergy, revenue, joy, complexity, novelty, and momentum. Select one to
          open its dossier, or drag two together to test a crossbreed.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-line/50 bg-slate-line/30">
          {stats.map((s) => (
            <div key={s.label} className="bg-navy-900/70 p-4">
              <p className="label-eyebrow">{s.label}</p>
              <p
                className={`mt-2 font-grotesk text-xl font-semibold tabular-nums ${s.accent}`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-line/50 bg-navy-900/40 p-4">
        <p className="label-eyebrow mb-2">How to operate</p>
        <ul className="space-y-1.5 text-xs leading-relaxed text-slate-ink">
          <li>· Click an organism to inspect its strategic dossier</li>
          <li>· Drag one near another to test a hybrid</li>
          <li>· Toggle Calm / Active to change ecosystem tempo</li>
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
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative mb-5 overflow-hidden rounded-xl border border-amber/40 bg-gradient-to-b from-amber/10 to-transparent p-4 shadow-[0_0_30px_-12px_rgba(212,168,67,0.5)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow text-amber/80">Hybrid Candidate</p>
          <h3 className="mt-1 font-grotesk text-lg font-semibold text-amber-glow">
            {hybrid.name}
          </h3>
          <p className="text-[11px] uppercase tracking-wider text-amber/70">
            {hybrid.species} · {hybrid.parentA.name} × {hybrid.parentB.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="focus-ring rounded-full p-1 text-slate-mute transition-colors hover:text-slate-100"
          aria-label="Dismiss hybrid"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-slate-ink">
        {hybrid.rationale}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ["Synergy", hybrid.blendedTraits.synergy],
            ["Novelty", hybrid.blendedTraits.novelty],
            ["Revenue", hybrid.blendedTraits.revenue],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            className="rounded-lg border border-amber/20 bg-navy-900/50 px-2.5 py-2"
          >
            <p className="text-[9px] uppercase tracking-wider text-slate-mute">
              {k}
            </p>
            <p className="font-grotesk text-base font-semibold tabular-nums text-amber-glow">
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
    >
      <div className="flex-1 overflow-y-auto pr-1">
        <AnimatePresence>
          {hybrid && (
            <HybridCard hybrid={hybrid} onDismiss={onDismissHybrid} />
          )}
        </AnimatePresence>

        {/* Identity */}
        <div className="flex items-center justify-between gap-3">
          <p className="label-eyebrow">Concept Dossier</p>
          <StatusBadge status={idea.status} />
        </div>
        <h2 className="mt-2 font-grotesk text-2xl font-semibold leading-tight text-slate-50">
          {idea.name}
        </h2>
        <p className="mt-1 text-xs uppercase tracking-widest2 text-teal/80">
          {idea.species}
        </p>

        <p className="mt-4 text-sm leading-relaxed text-slate-ink">
          {idea.description}
        </p>

        {/* Traits */}
        <div className="mt-7">
          <SectionTitle>Strategic Traits</SectionTitle>
          <div className="grid grid-cols-1 gap-3.5">
            {TRAIT_META.map((t, i) => (
              <TraitBar
                key={t.key}
                label={t.label}
                value={idea[t.key]}
                accent={t.accent}
                delay={0.05 * i}
              />
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mt-7">
          <SectionTitle>Signals</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {idea.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-line/70 bg-navy-800/50 px-3 py-1 text-[11px] text-slate-ink"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Best adjacent */}
        {best && (
          <div className="mt-7">
            <SectionTitle>Best Adjacent Node</SectionTitle>
            <div className="flex items-center justify-between rounded-xl border border-slate-line/60 bg-navy-900/50 p-3.5">
              <div>
                <p className="font-grotesk text-sm font-medium text-slate-100">
                  {best.name}
                </p>
                <p className="text-[11px] text-slate-mute">{best.species}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-mute">
                  Synergy
                </p>
                <p className="font-grotesk text-lg font-semibold tabular-nums text-teal">
                  {best.synergy}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mutations */}
        <div className="mt-7">
          <SectionTitle>Mutation Vectors</SectionTitle>
          <div className="space-y-2">
            {idea.mutationIdeas.map((m, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-lg border border-slate-line/50 bg-navy-900/40 p-3 transition-colors hover:border-teal/30"
              >
                <span className="mt-0.5 font-grotesk text-xs font-semibold tabular-nums text-teal/60">
                  0{i + 1}
                </span>
                <p className="text-xs leading-relaxed text-slate-ink">{m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-5 flex flex-col gap-2.5 border-t border-slate-line/50 pt-4">
        <button
          type="button"
          onClick={() => onPromote(idea)}
          disabled={idea.status === "promoted"}
          className="focus-ring group flex w-full items-center justify-center gap-2 rounded-xl border border-teal/50 bg-teal/15 py-3 text-sm font-semibold text-teal transition-all duration-300 hover:bg-teal/25 hover:shadow-[0_0_28px_-8px_rgba(0,217,181,0.7)] disabled:cursor-not-allowed disabled:border-slate-line/60 disabled:bg-navy-800/40 disabled:text-slate-mute disabled:shadow-none"
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
          {idea.status === "promoted" ? "In Build Queue" : "Promote to Build Queue"}
        </button>
        <button
          type="button"
          onClick={() => onCrossbreed(idea)}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-slate-line/70 bg-navy-800/40 py-2.5 text-sm font-medium text-slate-ink transition-all duration-300 hover:border-amber/40 hover:text-amber"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M7 4v6a5 5 0 0 0 5 5 5 5 0 0 0 5 5v0M17 4v6a5 5 0 0 1-5 5" />
          </svg>
          Crossbreed Idea
        </button>
      </div>
    </motion.div>
  );
}

export function IdeaPanel(props: IdeaPanelProps) {
  const { selected, hybrid, ideaById, ecosystem } = props;
  return (
    <aside className="glass relative flex h-full w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl shadow-panel">
      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/40 to-transparent" />
      <div className="flex h-full flex-col p-6">
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
