type IconCircleProps = {
  className?: string;
  label?: string;
  badge?: boolean;
  badgeType?: "submit" | "vote";
};

export const IconCircle = ({
  className = "",
  label,
  badge,
  badgeType = "submit",
}: IconCircleProps) => (
  <div className={`relative flex items-center ${label ? "gap-2" : ""}`}>
    <div
      className={`relative h-10 w-10 rounded-full border border-white/40 shadow-sm ${className}`}
    >
      {badge ? (
        <span
          className={`absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${
            badgeType === "vote" ? "bg-sky-400" : "bg-emerald-400"
          }`}
        >
          ✓
        </span>
      ) : null}
    </div>
    {label ? <span className="text-sm font-semibold">{label}</span> : null}
  </div>
);
