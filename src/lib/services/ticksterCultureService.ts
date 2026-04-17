import type { EventItem } from "@/lib/events/types";
import { normalizeCultureEvent, type RawCultureEvent } from "@/lib/services/cultureCommon";

const TICKSTER_SOURCE = "Tickster";
const TICKSTER_API_KEY_ENV = "TICKSTER_API_KEY";
const TICKSTER_ENDPOINTS = [
  "https://api.tickster.com/sv/api/0.4/events/upcoming",
  "https://api.tickster.com/sv/api/1.0/events/upcoming",
];

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function resolveTicksterApiKey(): string {
  const key = process.env[TICKSTER_API_KEY_ENV];
  if (key && key.trim().length > 0) return key.trim();

  const prompt = "Please enter your API key for Tickster:";
  console.error(prompt);
  throw new Error(`Missing ${TICKSTER_API_KEY_ENV}`);
}

function mapTicksterEvent(item: Record<string, unknown>): RawCultureEvent | null {
  const id = asText(item.id || item.event_id || item.eventId);
  const title = asText(item.name || item.title || item.event_name);
  const sourceUrl = asText(item.url || item.link || item.event_url);
  const summary = asText(item.description || item.summary || item.text) || null;
  const eventStart = asText(item.start || item.start_date || item.starts_at || item.event_start);
  const eventEnd = asText(item.end || item.end_date || item.ends_at || item.event_end) || null;

  const venueObj = (item.venue as Record<string, unknown> | undefined) ?? {};
  const venue = asText(venueObj.name || item.venue_name || item.place_name) || null;
  const city = asText((item.city as Record<string, unknown> | undefined)?.name || item.city_name);
  const locationName = asText(item.location_name || city || venue || "Stockholm");

  const lat =
    asNumber(venueObj.lat) ??
    asNumber(venueObj.latitude) ??
    asNumber((venueObj.location as Record<string, unknown> | undefined)?.lat) ??
    asNumber(item.lat);
  const lng =
    asNumber(venueObj.lng) ??
    asNumber(venueObj.longitude) ??
    asNumber((venueObj.location as Record<string, unknown> | undefined)?.lng) ??
    asNumber(item.lng);

  if (!id || !title || !sourceUrl || !eventStart) return null;

  return {
    id: `tickster-${id}`,
    title,
    source: TICKSTER_SOURCE,
    source_url: sourceUrl,
    summary,
    event_start: eventStart,
    event_end: eventEnd,
    venue,
    location_name: locationName || null,
    lat,
    lng,
  };
}

async function fetchTicksterRaw(limit: number, apiKey: string): Promise<RawCultureEvent[]> {
  for (const baseUrl of TICKSTER_ENDPOINTS) {
    const url = `${baseUrl}?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent("stockholm")}&limit=${Math.max(10, limit)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) continue;

    const payload = (await response.json()) as Record<string, unknown>;
    const list = toArray(
      (payload.events as Array<Record<string, unknown>> | undefined) ||
        (payload.results as Array<Record<string, unknown>> | undefined) ||
        (payload.data as Array<Record<string, unknown>> | undefined),
    );

    const mapped = list
      .map((item) => mapTicksterEvent(item))
      .filter((item): item is RawCultureEvent => item !== null);
    if (mapped.length > 0) return mapped;
  }

  return [];
}

export async function fetchTicksterCultureEvents(limit = 40): Promise<EventItem[]> {
  const sourceTag = "[culture:tickster]";
  let fetchedCount = 0;
  let normalizedCount = 0;
  let errorCount = 0;

  try {
    const apiKey = resolveTicksterApiKey();
    const rawEvents = await fetchTicksterRaw(limit, apiKey);
    fetchedCount = rawEvents.length;
    const normalized = await Promise.all(rawEvents.map((item) => normalizeCultureEvent(item)));
    const events = normalized.filter((item): item is EventItem => item !== null);
    normalizedCount = events.length;
    return events;
  } catch (error) {
    errorCount += 1;
    throw error;
  } finally {
    console.info(`${sourceTag} fetched=${fetchedCount} normalized=${normalizedCount} errors=${errorCount}`);
  }
}
