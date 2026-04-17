import type { EventCategory } from "@/lib/events/types";
import { getCategoryVisual } from "@/lib/events/categories";

type CategoryLegendProps = {
  categories: EventCategory[];
  className?: string;
};

export function CategoryLegend({ categories, className = "" }: CategoryLegendProps) {
  return (
    <div className={className} aria-label="Kategorilegend">
      <p className="mb-1 text-[11px] font-medium text-zinc-500">Kategoriöversikt</p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => {
          const visual = getCategoryVisual(category);
          return (
            <span
              key={category}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${visual.badgeClassName}`}
            >
              <span aria-hidden>{visual.icon}</span>
              <span>{visual.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

