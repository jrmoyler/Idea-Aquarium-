import { motion } from "framer-motion";

interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

/** Toggleable filter chip. Distinct rest / hover / active states with a quiet
 * teal active treatment. */
export function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={[
        "focus-ring group flex items-center gap-2 rounded-full px-3.5 py-1.5",
        "text-xs font-medium transition-colors duration-300",
        active
          ? "border border-teal/45 bg-teal/10 text-teal shadow-[0_0_20px_-8px_rgba(0,217,181,0.7)]"
          : "border border-slate-line/60 bg-navy-800/30 text-slate-mute hover:border-slate-ink/40 hover:bg-navy-800/60 hover:text-slate-700",
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full transition-all duration-300",
          active
            ? "bg-teal shadow-[0_0_8px_0_rgba(0,217,181,0.9)] animate-pulse-soft"
            : "bg-slate-mute/70 group-hover:bg-slate-ink",
        ].join(" ")}
      />
      {label}
      {typeof count === "number" && (
        <span
          className={[
            "tabular-nums text-[10px] transition-colors duration-300",
            active ? "text-teal/70" : "text-slate-mute/70",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </motion.button>
  );
}
