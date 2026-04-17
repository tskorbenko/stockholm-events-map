import type { EventItem } from "@/lib/events/types";
import { normalizeCultureEvent, type RawCultureEvent } from "@/lib/services/cultureCommon";

const TICKETMASTER_SOURCE = "Ticketmaster";
const TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const TICKETMASTER_EVENT_DETAILS_URL = "https://app.ticketmaster.com/discovery/v2/events";
const TICKETMASTER_API_KEY_ENV = "TICKETMASTER_API_KEY";

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveTicketmasterApiKey(): string {
  const key = process.env[TICKETMASTER_API_KEY_ENV];
  if (key && key.trim().length > 0) return key.trim();

  const prompt = "Please enter your API key for Ticketmaster:";
  console.error(prompt);
  throw new Error(`Missing ${TICKETMASTER_API_KEY_ENV}`);
}

function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCoarseLocation(locationName?: string | null): boolean {
  const normalized = normalizeLoose(locationName || "");
  return (
    normalized === "stockholm" ||
    normalized === "stockholms lan" ||
    normalized === "stockholm kommun" ||
    normalized === "stockholm city"
  );
}

function cleanHtmlText(value: string): string {
  return value
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sa = Math.sin(dLat / 2) ** 2;
  const sb =
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(sa + sb), Math.sqrt(1 - sa - sb));
  return R * c;
}

function inferKnownStockholmVenue(lat?: number | null, lng?: number | null): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const knownVenues = [
    // Avicii Arena / Globen area.
    { name: "Avicii Arena", lat: 59.2936, lng: 18.0832, maxDistanceKm: 0.55 },
  ];

  for (const venue of knownVenues) {
    const km = distanceKm(lat as number, lng as number, venue.lat, venue.lng);
    if (km <= venue.maxDistanceKm) return venue.name;
  }
  return null;
}

function extractVenueAndLocationFromHtml(html: string): { venue: string; locationName: string } | null {
  const candidates = new Set<string>();

  const patterns = [
    /"location"\s*:\s*\{[\s\S]{0,1200}?"name"\s*:\s*"([^"]{3,120})"/gi,
    /"venueName"\s*:\s*"([^"]{3,120})"/gi,
    />\s*([^<]{3,120},\s*Stockholm)\s*</gi,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(html);
    while (match) {
      const value = cleanHtmlText(match[1] || "");
      if (value) candidates.add(value);
      match = pattern.exec(html);
    }
  }

  const locationCandidate = Array.from(candidates).find((candidate) => {
    const normalized = normalizeLoose(candidate);
    if (!normalized.includes("stockholm")) return false;
    if (normalized.includes("ticketmaster")) return false;
    if (normalized.includes("kakor")) return false;
    return true;
  });

  if (!locationCandidate) return null;

  const venuePart = locationCandidate.split(",")[0]?.trim() || "";
  const venue = venuePart && normalizeLoose(venuePart) !== "stockholm" ? venuePart : "";
  if (!venue) return null;

  return {
    venue,
    locationName: locationCandidate,
  };
}

async function enrichMissingVenueFromDetails(raw: RawCultureEvent, apiKey: string): Promise<RawCultureEvent> {
  const rawId = raw.id.replace(/^ticketmaster-/, "").trim();
  if (!rawId) return raw;

  try {
    const detailsUrl = `${TICKETMASTER_EVENT_DETAILS_URL}/${encodeURIComponent(rawId)}.json?apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(detailsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return raw;

    const payload = (await response.json()) as Record<string, unknown>;
    const venue = (
      ((payload._embedded as Record<string, unknown> | undefined)?.venues as Array<Record<string, unknown>> | undefined)?.[0]
    ) || null;
    const venueName = asText(venue?.name);
    const city = asText((venue?.city as Record<string, unknown> | undefined)?.name);
    const lat = asNumber((venue?.location as Record<string, unknown> | undefined)?.latitude);
    const lng = asNumber((venue?.location as Record<string, unknown> | undefined)?.longitude);
    const locationName = venueName && city ? `${venueName}, ${city}` : venueName || city || raw.location_name || "Stockholm";

    if (!venueName && !city && !Number.isFinite(lat) && !Number.isFinite(lng)) {
      return raw;
    }

    return {
      ...raw,
      venue: raw.venue || venueName || null,
      location_name: locationName,
      lat: raw.lat ?? lat,
      lng: raw.lng ?? lng,
    };
  } catch {
    return raw;
  }
}

async function enrichMissingVenue(raw: RawCultureEvent, apiKey: string): Promise<RawCultureEvent> {
  if (raw.venue && raw.venue.trim().length > 0 && !isCoarseLocation(raw.location_name)) return raw;
  const fromDetails = await enrichMissingVenueFromDetails(raw, apiKey);
  if (fromDetails.venue && fromDetails.venue.trim().length > 0 && !isCoarseLocation(fromDetails.location_name)) {
    return fromDetails;
  }

  const inferredVenue = inferKnownStockholmVenue(fromDetails.lat, fromDetails.lng);
  if (inferredVenue && isCoarseLocation(fromDetails.location_name)) {
    return {
      ...fromDetails,
      venue: fromDetails.venue || inferredVenue,
      location_name: `${inferredVenue}, Stockholm`,
    };
  }

  if (!fromDetails.source_url) return fromDetails;

  try {
    const response = await fetch(fromDetails.source_url, {
      method: "GET",
      headers: { Accept: "text/html" },
      cache: "no-store",
    });

    if (!response.ok) return fromDetails;

    const html = await response.text();
    const extracted = extractVenueAndLocationFromHtml(html);
    if (!extracted) return fromDetails;

    return {
      ...fromDetails,
      venue: fromDetails.venue || extracted.venue,
      location_name: extracted.locationName,
    };
  } catch {
    return fromDetails;
  }
}

function mapTicketmasterEvent(item: Record<string, unknown>): RawCultureEvent | null {
  const id = asText(item.id);
  const title = asText(item.name);
  const sourceUrl = asText(item.url);
  const info = asText(item.info) || asText(item.pleaseNote) || null;

  const dates = (item.dates as Record<string, unknown> | undefined)?.start as
    | Record<string, unknown>
    | undefined;
  const eventStart = asText(dates?.dateTime) || `${asText(dates?.localDate)}T${asText(dates?.localTime)}`.trim();

  const endData = (item.dates as Record<string, unknown> | undefined)?.end as Record<string, unknown> | undefined;
  const eventEnd = asText(endData?.dateTime) || null;

  const venue = (
    ((item._embedded as Record<string, unknown> | undefined)?.venues as Array<Record<string, unknown>> | undefined)?.[0]
  ) || null;
  const venueName = asText(venue?.name) || null;
  const city = asText((venue?.city as Record<string, unknown> | undefined)?.name);
  const locationName = venueName && city ? `${venueName}, ${city}` : venueName || city || "Stockholm";
  const lat = asNumber((venue?.location as Record<string, unknown> | undefined)?.latitude);
  const lng = asNumber((venue?.location as Record<string, unknown> | undefined)?.longitude);

  if (!id || !title || !sourceUrl || !eventStart) return null;

  return {
    id: `ticketmaster-${id}`,
    title,
    source: TICKETMASTER_SOURCE,
    source_url: sourceUrl,
    summary: info,
    event_start: eventStart,
    event_end: eventEnd,
    venue: venueName,
    location_name: locationName,
    lat,
    lng,
  };
}

export async function fetchTicketmasterCultureEvents(limit = 40): Promise<EventItem[]> {
  const sourceTag = "[culture:ticketmaster]";
  let fetchedCount = 0;
  let normalizedCount = 0;
  let errorCount = 0;

  try {
    const apiKey = resolveTicketmasterApiKey();
    const url = `${TICKETMASTER_EVENTS_URL}?apikey=${encodeURIComponent(apiKey)}&city=Stockholm&countryCode=SE&size=${Math.max(10, limit)}&sort=date,asc`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Ticketmaster API request failed: ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawList =
      ((payload._embedded as Record<string, unknown> | undefined)?.events as Array<Record<string, unknown>> | undefined) ??
      [];
    fetchedCount = rawList.length;

    const rawCulture = rawList
      .map((item) => mapTicketmasterEvent(item))
      .filter((item): item is RawCultureEvent => item !== null);

    const enrichedRawCulture = await Promise.all(rawCulture.map((item) => enrichMissingVenue(item, apiKey)));
    const normalized = await Promise.all(enrichedRawCulture.map((item) => normalizeCultureEvent(item)));
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
