import fs from "fs/promises";
import path from "path";
import type { EventItem } from "@/lib/events/types";

const CACHE_FILE_PATH = path.join(process.cwd(), "data", "events_history.json");
const MAX_AGE_DAYS = 7;

export async function loadEventsFromCache(): Promise<EventItem[]> {
  try {
    const data = await fs.readFile(CACHE_FILE_PATH, "utf-8");
    const normalized = data.replace(/^\uFEFF/, "");
    return JSON.parse(normalized) as EventItem[];
  } catch (error) {
    // If file doesn't exist or is invalid, return empty array
    return [];
  }
}

export async function saveEventsToCache(events: EventItem[]): Promise<void> {
  try {
    const dir = path.dirname(CACHE_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(events, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save event cache:", error);
  }
}

export function mergeAndPruneEvents(
  existing: EventItem[],
  newlyFetched: EventItem[]
): EventItem[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const nowMs = now.getTime();

  // Use a Map to ensure uniqueness by ID
  const eventMap = new Map<string, EventItem>();

  function canonicalEventId(event: EventItem): string {
    const isPolisen = event.source_type === "polisen" || event.source === "Polisen" || event.category === "crime";
    if (!isPolisen) return event.id;

    const rawId = String(event.id ?? "").trim();
    if (!rawId) return "polisen-unknown";
    if (rawId.startsWith("polisen-")) return rawId;
    return `polisen-${rawId}`;
  }

  // Add existing events to the map
  for (const event of existing) {
    const normalizedEvent = {
      ...event,
      id: canonicalEventId(event),
    };
    eventMap.set(normalizedEvent.id, normalizedEvent);
  }

  // Add/Update with newly fetched events
  for (const event of newlyFetched) {
    const normalizedEvent = {
      ...event,
      id: canonicalEventId(event),
    };
    eventMap.set(normalizedEvent.id, normalizedEvent);
  }

  function getPrimaryTime(event: EventItem): number {
    const startCandidate = event.event_start || event.created_at;
    const parsed = new Date(startCandidate).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isFuturePlanned(event: EventItem): boolean {
    if (event.is_future_event) return true;
    if (!event.event_start) return false;
    return getPrimaryTime(event) > nowMs;
  }

  // Convert back to array and filter by age
  return Array.from(eventMap.values())
    .filter((event) => {
      const createdAt = new Date(event.created_at);
      return createdAt >= cutoff;
    })
    .sort((a, b) => {
      const aFuture = isFuturePlanned(a);
      const bFuture = isFuturePlanned(b);
      if (aFuture !== bFuture) return aFuture ? 1 : -1;

      const aTime = getPrimaryTime(a);
      const bTime = getPrimaryTime(b);

      // Future/planned items: nearest first. Incidents/news: newest first.
      if (aFuture) return aTime - bTime;
      return bTime - aTime;
    });
}
