"use client";
import { getCategoryVisual } from "@/lib/events/categories";
import type { EventCategory } from "@/lib/events/types";
import type { TimeFilterKey } from "@/lib/events/timeFilter";

type TimeFilterOption = { key: TimeFilterKey; label: string };

type MapControlsPanelProps = {
  title: string;
  isListOpen: boolean;
  onToggleList: () => void;
  onReset: () => void;
  categories: EventCategory[];
  activeFilters: EventCategory[];
  onToggleCategory: (category: EventCategory) => void;
  timeOptions: TimeFilterOption[];
  activeTimeFilter: TimeFilterKey;
  onSelectTimeFilter: (key: TimeFilterKey) => void;
  isMobileCompact?: boolean;
  className?: string;
};

export function MapControlsPanel({
  title,
  isListOpen,
  onToggleList,
  onReset,
  categories,
  activeFilters,
  onToggleCategory,
  timeOptions,
  activeTimeFilter,
  onSelectTimeFilter,
  isMobileCompact = false,
  className = "",
}: MapControlsPanelProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-600">{title}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleList}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700 before:content-['≡'] before:text-[12px] before:leading-none hover:bg-zinc-50"
          >
            {isListOpen ? "Dölj lista" : "Visa lista"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 before:content-['↺'] before:text-[12px] before:leading-none hover:text-zinc-800"
          >
            Återställ
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {categories.map((category) => {
          const enabled = activeFilters.includes(category);
          const visual = getCategoryVisual(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => onToggleCategory(category)}
              className={`w-full rounded-full px-2 py-1 text-[11px] leading-tight capitalize transition ${
                enabled ? "text-white" : "border border-zinc-200 bg-zinc-100 text-zinc-400"
              }`}
              style={enabled ? { backgroundColor: visual.markerColor, borderWidth: 0 } : undefined}
            >
              {visual.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 border-t border-zinc-200 pt-2">
        {!isMobileCompact ? (
          <p className="mb-1 text-[11px] font-medium text-zinc-500">Tid</p>
        ) : null}
        <div className={isMobileCompact ? "grid grid-cols-4 gap-1.5" : "flex flex-wrap gap-1.5"}>
          {timeOptions.map((option) => {
            const selected = activeTimeFilter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelectTimeFilter(option.key)}
                className={`rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition ${
                  selected
                    ? "border-zinc-400 bg-zinc-200 text-zinc-900"
                    : "border-zinc-200 bg-zinc-100 text-zinc-500"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

