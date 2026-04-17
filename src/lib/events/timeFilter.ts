import type { EventItem } from "@/lib/events/types";

export type TimeFilterKey = "1h" | "today" | "24h" | "7d";

export function filterEventsByTime(
  events: EventItem[],
  filter: TimeFilterKey,
  now = new Date(),
): EventItem[] {
  const nowMs = now.getTime();
  const next72hMs = nowMs + 72 * 60 * 60 * 1000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  return events.filter((event) => {
    const isCultureEvent = event.category === "culture" || event.source_type === "culture";
    const primaryTime = isCultureEvent ? event.event_start || event.created_at : event.created_at;
    const eventMs = new Date(primaryTime).getTime();
    if (!Number.isFinite(eventMs)) return false;

    let isInSelectedRange = false;

    if (filter === "1h") {
      isInSelectedRange = eventMs >= nowMs - 60 * 60 * 1000;
    } else if (filter === "today") {
      isInSelectedRange = eventMs >= startOfTodayMs;
    } else if (filter === "24h") {
      isInSelectedRange = eventMs >= nowMs - 24 * 60 * 60 * 1000;
    } else {
      isInSelectedRange = eventMs >= nowMs - 7 * 24 * 60 * 60 * 1000;
    }

    if (!isCultureEvent) {
      return isInSelectedRange;
    }

    const isPastInSelectedRange = isInSelectedRange && eventMs <= nowMs;
    const isUpcomingWithin72h = eventMs > nowMs && eventMs <= next72hMs;
    return isPastInSelectedRange || isUpcomingWithin72h;
  });
}
