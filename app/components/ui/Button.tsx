import type { ReactNode } from "react";

type ButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
};

export const PrimaryButton = ({
  onClick,
  disabled,
  children,
  className = "",
  type = "button",
}: ButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-xl bg-linear-to-r from-indigo-600 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200/40 transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 ${className}`}
  >
    {children}
  </button>
);

export const OutlineButton = ({
  onClick,
  disabled,
  children,
  className = "",
  type = "button",
}: ButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

export const DangerButton = ({
  onClick,
  disabled,
  children,
  className = "",
  type = "button",
}: ButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 shadow-sm transition hover:border-red-300 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

export const GhostButton = ({
  onClick,
  disabled,
  children,
  className = "",
  type = "button",
}: ButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20 disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);
