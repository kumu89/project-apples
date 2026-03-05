export type Profile = {
  name: string;
  icon: string;
};

export const PROFILE_ICONS = [
  { id: "red", className: "bg-red-500" },
  { id: "blue", className: "bg-blue-500" },
  { id: "green", className: "bg-emerald-500" },
  { id: "purple", className: "bg-violet-500" },
  { id: "orange", className: "bg-orange-500" },
  { id: "pink", className: "bg-pink-500" },
  { id: "yellow", className: "bg-yellow-400" },
  { id: "cyan", className: "bg-cyan-500" },
] as const;

export const DEFAULT_PROFILE: Profile = {
  name: "プレイヤー",
  icon: "blue",
};

export const resolveIconClass = (icon: string) =>
  PROFILE_ICONS.find((item) => item.id === icon)?.className ?? "bg-blue-500";
