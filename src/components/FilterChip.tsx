interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

/** Toggleable filter chip with a quiet active state. */
export function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "focus-ring group flex items-center gap-2 rounded-full px-3.5 py-1.5",
        "text-xs font-medium transition-all duration-300",
        active
          ? "border border-teal/40 bg-teal/10 text-teal shadow-[0_0_18px_-6px_rgba(0,217,181,0.6)]"
          : "border border-slate-line/70 bg-navy-800/40 text-slate-ink hover:border-slate-ink/40 hover:text-slate-100",
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full transition-colors duration-300",
          active ? "bg-teal animate-pulse-soft" : "bg-slate-mute",
        ].join(" ")}
      />
      {label}
      {typeof count === "number" && (
        <span
          className={[
            "tabular-nums text-[10px]",
            active ? "text-teal/70" : "text-slate-mute",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </button>
  );
}
