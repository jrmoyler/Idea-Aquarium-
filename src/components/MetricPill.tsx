interface MetricPillProps {
  label: string;
  value: string | number;
  accent?: "teal" | "amber" | "neutral";
}

const ACCENT: Record<NonNullable<MetricPillProps["accent"]>, string> = {
  teal: "text-teal",
  amber: "text-amber",
  neutral: "text-slate-ink",
};

/** Compact metric readout used in the header's ecosystem strip. */
export function MetricPill({ label, value, accent = "neutral" }: MetricPillProps) {
  return (
    <div className="flex flex-col items-start gap-1 px-3.5 py-2">
      <span className="label-eyebrow">{label}</span>
      <span
        className={`font-grotesk text-sm font-medium tabular-nums ${ACCENT[accent]}`}
      >
        {value}
      </span>
    </div>
  );
}
