import type { EventItem } from "@/lib/events/types";
import { normalizeCultureEvent, type RawCultureEvent } from "@/lib/services/cultureCommon";

const BANDSINTOWN_SOURCE = "bandsintown";
const BANDSINTOWN_APP_ID_ENV = "BANDSINTOWN_APP_ID";
const BANDSINTOWN_EVENTS_URL = "https://rest.bandsintown.com/events/search";

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveBandsintownAppId(): string {
  const appId = process.env[BANDSINTOWN_APP_ID_ENV];
  if (appId && appId.trim().length > 0) return appId.trim();

  const prompt = "Please enter your Bandsintown app_id:";
  console.error(prompt);
  throw new Error(`Missing ${BANDSINTOWN_APP_ID_ENV}`);
}

function mapBandsintownEvent(item: Record<string, unknown>): RawCultureEvent | null {
  const id = asText(item.id);
  const datetime = asText(item.datetime || item.starts_at || item.start_time);
  const sourceUrl = asText(item.url || item.ticket_url || item.facebook_rsvp_url);
  const title =
    asText(item.title) ||
    asText((item.lineup as unknown[] | undefined)?.[0]) ||
    "Concert";

  const venue = (item.venue as Record<string, unknown> | undefined) ?? {};
  const venueName = asText(venue.name) || null;
  const city = asText(venue.city);
  const region = asText(venue.region);
  const country = asText(venue.country);

  const locationNameParts = [venueName, city].filter(Boolean);
  const locationName = locationNameParts.length > 0 ? locationNameParts.join(", ") : city || "Stockholm";

  const lat =
    asNumber(venue.latitude) ??
    asNumber((venue.location as Record<string, unknown> | undefined)?.lat) ??
    asNumber(item.latitude);
  const lng =
    asNumber(venue.longitude) ??
    asNumber((venue.location as Record<string, unknown> | undefined)?.lng) ??
    asNumber(item.longitude);

  const summaryParts = [asText(item.description), asText(item.offers), region, country].filter(Boolean);
  const summary = summaryParts.length > 0 ? summaryParts.join(" ").trim() : null;

  if (!id || !datetime || !sourceUrl || !title) return null;

  return {
    id: `bandsintown-${id}`,
    title,
    source: BANDSINTOWN_SOURCE,
    source_url: sourceUrl,
    summary,
    event_start: datetime,
    event_end: null,
    venue: venueName,
    location_name: locationName,
    lat,
    lng,
  };
}

function isStockholmEvent(raw: RawCultureEvent): boolean {
  const location = `${raw.location_name || ""} ${raw.venue || ""}`.toLowerCase();
  return location.includes("stockholm");
}

export async function fetchBandsintownCultureEvents(limit = 40): Promise<EventItem[]> {
  const sourceTag = "[culture:bandsintown]";
  let fetchedCount = 0;
  let normalizedCount = 0;
  let errorCount = 0;

  try {
    const appId = resolveBandsintownAppId();
    const url =
      `${BANDSINTOWN_EVENTS_URL}?app_id=${encodeURIComponent(appId)}` +
      `&location=${encodeURIComponent("Stockholm, Sweden")}` +
      `&radius=80&date=upcoming&per_page=${Math.max(10, limit)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Bandsintown API request failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const rawList = Array.isArray(payload) ? payload : [];
    fetchedCount = rawList.length;

    const mappedRaw = rawList
      .map((item) => (item && typeof item === "object" ? mapBandsintownEvent(item as Record<string, unknown>) : null))
      .filter((item): item is RawCultureEvent => item !== null)
      .filter((item) => isStockholmEvent(item))
      .slice(0, limit);

    const normalized = await Promise.all(mappedRaw.map((item) => normalizeCultureEvent(item)));
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
