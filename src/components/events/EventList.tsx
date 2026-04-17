"use client";

import type { EventItem } from "@/lib/events/types";
import { getCategoryVisual } from "@/lib/events/categories";

type EventListProps = {
  events: EventItem[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
  className?: string;
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Stockholm",
  });
}

export function EventList({ events, selectedId, onSelect, className = "" }: EventListProps) {
  return (
    <section className={className} aria-label="Händelselista">
      <div className="border-b border-zinc-200 px-3 py-2">
        <p className="text-xs font-medium text-zinc-600">{events.length} händelser</p>
      </div>
      <div className="max-h-full overflow-y-auto pb-3">
        {events.map((event) => {
          const selected = selectedId === event.id;
          const visual = getCategoryVisual(event.category);
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelect(event.id)}
              className={`w-full border-b px-3 py-2 text-left transition ${
                selected
                  ? "border-zinc-200 bg-zinc-100/85 ring-1 ring-zinc-200"
                  : "border-zinc-100 bg-white hover:bg-zinc-50"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${visual.dotClassName}`} />
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {visual.label}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-medium text-zinc-900">{event.title}</p>
              <p className="mt-1 text-xs text-zinc-600">{event.location_name}</p>
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                <span>{event.source}</span>
                <span>{formatTime(event.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
