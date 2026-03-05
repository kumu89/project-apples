import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  badge?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export const SectionCard = ({
  title,
  badge,
  description,
  children,
  className = "",
}: SectionCardProps) => (
  <section
    className={`rounded-3xl border border-white/40 bg-white/95 p-6 text-zinc-900 shadow-xl ${className}`}
  >
    <div className="flex flex-wrap items-center gap-2">
      {badge ? (
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          {badge}
        </span>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
    {description ? (
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
    ) : null}
    <div className="mt-4">{children}</div>
  </section>
);
