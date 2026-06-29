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

// Teal is the active-intelligence accent; amber carries strategic weight
// (revenue and complexity), keeping the palette restrained and coherent.
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
      ? "linear-gradient(90deg, rgba(0,217,181,0.55), #00D9B5)"
      : "linear-gradient(90deg, rgba(212,168,67,0.5), #D4A843)";
  const glow =
    accent === "teal"
      ? "0 0 10px -2px rgba(0,217,181,0.8)"
      : "0 0 10px -2px rgba(212,168,67,0.75)";
  const textColor = accent === "teal" ? "text-teal" : "text-amber";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        <span className="flex items-baseline gap-2.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-mute">
            {traitLabel(value)}
          </span>
          <span
            className={`w-7 text-right font-grotesk text-sm font-semibold tabular-nums ${textColor}`}
          >
            {value}
          </span>
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-navy-700/50 ring-1 ring-inset ring-white/[0.03]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: fill, boxShadow: glow }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.8, ease: EASE_OUT }}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="label-eyebrow mb-3.5">{children}</p>;
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

/** Thin terminal meta row — gives the pane its biotech-instrument feel. */
function PaneMeta({ id }: { id: string }) {
  return (
    <div className="mb-5 flex items-center justify-between border-b border-slate-line/40 pb-3">
      <span className="font-mono text-[10px] uppercase tracking-widest2 text-slate-mute">
        DOSSIER · {id}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-soft" />
        <span className="font-mono text-[10px] uppercase tracking-widest2 text-teal/70">
          Live
        </span>
      </span>
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
    { label: "Dormant", value: ecosystem.dormant, accent: "text-slate-700" },
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
        <h2 className="font-grotesk text-[26px] font-semibold leading-[1.15] tracking-tight text-slate-900 text-balance">
          The habitat is alive.
        </h2>
        <p className="mt-3.5 text-[13px] leading-relaxed text-slate-ink">
          Every organism is a venture concept. Its motion, mass, and glow encode
          synergy, revenue, joy, complexity, novelty, and momentum. Select one to
          open its dossier — or drag two together to test a crossbreed.
        </p>

        <div className="mt-8 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-line/40 bg-navy-900/30">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={[
                "p-4",
                i % 3 !== 2 ? "border-r border-slate-line/30" : "",
                i < 3 ? "border-b border-slate-line/30" : "",
              ].join(" ")}
            >
              <p className="label-eyebrow">{s.label}</p>
              <p
                className={`mt-2.5 font-grotesk text-lg font-semibold tabular-nums ${s.accent}`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-slate-line/40 bg-navy-900/30 p-4">
        <p className="label-eyebrow">How to operate</p>
        <ul className="space-y-2 text-[13px] leading-snug text-slate-ink">
          {[
            "Click an organism to inspect its strategic dossier",
            "Drag one near another to surface a hybrid",
            "Toggle Calm / Active to change ecosystem tempo",
          ].map((line, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-teal/60" />
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
          className="focus-ring -mr-1 -mt-1 rounded-full p-1.5 text-slate-mute transition-colors hover:text-slate-800"
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
      <p className="mt-3 text-[13px] leading-relaxed text-slate-ink">
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

      <div className="-mr-3 flex-1 overflow-y-auto pr-3">
        <AnimatePresence>
          {hybrid && <HybridCard hybrid={hybrid} onDismiss={onDismissHybrid} />}
        </AnimatePresence>

        {/* Identity */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-widest2 text-teal/80">
            {idea.species}
          </p>
          <StatusBadge status={idea.status} />
        </div>
        <h2 className="mt-2.5 font-grotesk text-[26px] font-semibold leading-[1.1] tracking-tight text-slate-900">
          {idea.name}
        </h2>
        <p className="mt-3.5 text-[13px] leading-relaxed text-slate-ink">
          {idea.description}
        </p>

        {/* Traits */}
        <div className="mt-8">
          <SectionTitle>Strategic Traits</SectionTitle>
          <div className="grid grid-cols-1 gap-4">
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

        {/* Tags */}
        <div className="mt-8">
          <SectionTitle>Signals</SectionTitle>
          <div className="flex flex-wrap gap-2">
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

        {/* Best adjacent */}
        {best && (
          <div className="mt-8">
            <SectionTitle>Best Adjacent Node</SectionTitle>
            <div className="group flex items-center justify-between rounded-xl border border-slate-line/50 bg-navy-900/40 p-4 transition-colors hover:border-teal/30">
              <div className="flex items-center gap-3">
                <span className="h-7 w-7 rounded-full border border-teal/30 bg-teal/5" />
                <div>
                  <p className="font-grotesk text-sm font-medium text-slate-800">
                    {best.name}
                  </p>
                  <p className="text-[11px] text-slate-mute">{best.species}</p>
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

        {/* Mutations */}
        <div className="mt-8 pb-1">
          <SectionTitle>Mutation Vectors</SectionTitle>
          <div className="space-y-2">
            {idea.mutationIdeas.map((m, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-lg border border-slate-line/40 bg-navy-900/30 p-3.5 transition-colors hover:border-teal/25 hover:bg-navy-800/30"
              >
                <span className="mt-px font-mono text-[11px] font-semibold tabular-nums text-teal/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[13px] leading-relaxed text-slate-ink">{m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-5 flex flex-col gap-2.5 border-t border-slate-line/40 pt-5">
        <motion.button
          type="button"
          onClick={() => onPromote(idea)}
          disabled={idea.status === "promoted"}
          whileHover={idea.status === "promoted" ? undefined : { scale: 1.012 }}
          whileTap={idea.status === "promoted" ? undefined : { scale: 0.985 }}
          transition={{ type: "spring", stiffness: 400, damping: 26 }}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-teal/50 bg-teal/15 py-3 text-sm font-semibold text-teal transition-colors duration-300 hover:bg-teal/25 hover:shadow-[0_0_30px_-10px_rgba(0,217,181,0.8)] disabled:cursor-not-allowed disabled:border-slate-line/50 disabled:bg-navy-800/40 disabled:text-slate-mute disabled:shadow-none"
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
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl border border-slate-line/60 bg-navy-800/30 py-2.5 text-sm font-medium text-slate-ink transition-colors duration-300 hover:border-amber/40 hover:text-amber"
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
    <aside className="relative flex h-full w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/78 shadow-[0_24px_50px_-28px_rgba(6,95,110,0.58)] backdrop-blur-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/35 to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/60" />
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
