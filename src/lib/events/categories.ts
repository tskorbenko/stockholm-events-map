import type { EventCategory } from "@/lib/events/types";

export type CategoryVisual = {
  key: string;
  label: string;
  icon: string;
  markerColor: string;
  dotClassName: string;
  chipActiveClassName: string;
  badgeClassName: string;
};

const DEFAULT_CATEGORY_VISUAL: CategoryVisual = {
  key: "other",
  label: "\u00d6vrigt",
  icon: "\u25cf",
  markerColor: "#6b7280",
  dotClassName: "bg-zinc-500",
  chipActiveClassName: "border-zinc-300 text-zinc-700",
  badgeClassName: "bg-zinc-100 text-zinc-700",
};

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  crime: {
    key: "crime",
    label: "Brott",
    icon: "\u25cf",
    markerColor: "#dc2626",
    dotClassName: "bg-red-600",
    chipActiveClassName: "border-red-200 text-red-700",
    badgeClassName: "bg-red-50 text-red-700",
  },
  traffic: {
    key: "traffic",
    label: "Trafik",
    icon: "\u25cf",
    markerColor: "#2563eb",
    dotClassName: "bg-blue-500",
    chipActiveClassName: "border-blue-200 text-blue-700",
    badgeClassName: "bg-blue-50 text-blue-700",
  },
  local_news: {
    key: "local_news",
    label: "Nyheter",
    icon: "\u25cf",
    markerColor: "#22c55e",
    dotClassName: "bg-green-500",
    chipActiveClassName: "border-green-200 text-green-700",
    badgeClassName: "bg-green-50 text-green-700",
  },
  politics: {
    key: "politics",
    label: "Politik",
    icon: "\u25cf",
    markerColor: "#0f766e",
    dotClassName: "bg-teal-600",
    chipActiveClassName: "border-teal-200 text-teal-700",
    badgeClassName: "bg-teal-50 text-teal-700",
  },
  culture: {
    key: "culture",
    label: "Kultur",
    icon: "\u25cf",
    markerColor: "#7c3aed",
    dotClassName: "bg-violet-500",
    chipActiveClassName: "border-violet-200 text-violet-700",
    badgeClassName: "bg-violet-50 text-violet-700",
  },
  sport: {
    key: "sport",
    label: "Sport",
    icon: "\u25cf",
    markerColor: "#f97316",
    dotClassName: "bg-orange-500",
    chipActiveClassName: "border-orange-200 text-orange-700",
    badgeClassName: "bg-orange-50 text-orange-700",
  },
  other: {
    key: "other",
    label: "\u00d6vrigt",
    icon: "\u25cf",
    markerColor: "#6b7280",
    dotClassName: "bg-zinc-500",
    chipActiveClassName: "border-zinc-300 text-zinc-700",
    badgeClassName: "bg-zinc-100 text-zinc-700",
  },
};

export const CATEGORY_ORDER: EventCategory[] = [
  "crime",
  "traffic",
  "local_news",
  "culture",
  "sport",
  "other",
];

export function getCategoryVisual(category: EventCategory | string): CategoryVisual {
  return CATEGORY_VISUALS[category] ?? DEFAULT_CATEGORY_VISUAL;
}


