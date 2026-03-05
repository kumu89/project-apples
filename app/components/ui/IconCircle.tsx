type IconCircleProps = {
  className?: string;
  label?: string;
  badge?: boolean;
};

export const IconCircle = ({
  className = "",
  label,
  badge,
}: IconCircleProps) => (
  <div className={`relative flex items-center ${label ? "gap-2" : ""}`}>
    <div
      className={`relative h-10 w-10 rounded-full border border-white/40 shadow-sm ${className}`}
    >
      {badge ? (
        <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-white">
          ✓
        </span>
      ) : null}
    </div>
    {label ? <span className="text-sm font-semibold">{label}</span> : null}
  </div>
);
