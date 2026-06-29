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
    <div className="flex min-w-[88px] flex-col gap-1.5 px-4 py-2">
      <span className="label-eyebrow">{label}</span>
      <span
        className={`font-grotesk text-[15px] font-semibold leading-none tabular-nums ${ACCENT[accent]}`}
      >
        {value}
      </span>
    </div>
  );
}
