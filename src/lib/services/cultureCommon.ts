import type { EventItem } from "@/lib/events/types";
import {
  geocodeStockholmNewsToponymFromText,
  geocodeToponymBestEffort,
} from "@/lib/events/locationExtraction";

export type RawCultureEvent = {
  id: string;
  title: string;
  source: string;
  source_url: string;
  summary?: string | null;
  event_start: string;
  event_end?: string | null;
  venue?: string | null;
  location_name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

function toIsoOrNull(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function hasCoords(lat?: number | null, lng?: number | null): lat is number {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLoose(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildLocationLabel(venue?: string | null, locationName?: string | null): string {
  const venueValue = normalizeText(venue || "");
  const locationValue = normalizeText(locationName || "");

  if (venueValue && locationValue) {
    const venueLoose = normalizeLoose(venueValue);
    const locationLoose = normalizeLoose(locationValue);
    if (locationLoose.includes(venueLoose)) return locationValue;
    return `${venueValue}, ${locationValue}`;
  }

  return venueValue || locationValue || "Stockholm";
}

function isCoarseStockholmLocation(value: string): boolean {
  const normalized = normalizeLoose(value);
  return (
    normalized === "stockholm" ||
    normalized === "stockholms lan" ||
    normalized === "stockholm city" ||
    normalized === "stockholm kommun"
  );
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

async function geocodeCultureBestEffort(raw: RawCultureEvent): Promise<{
  query: string;
  coords: { lat: number; lng: number };
  priority: 1 | 2 | 3;
} | null> {
  const venue = normalizeText(raw.venue || "");
  const location = normalizeText(raw.location_name || "");
  const venueLoose = normalizeLoose(venue);
  const locationLoose = normalizeLoose(location);

  // Priority 1: venue / institution names (requested for more precise pinning).
  const venueCandidates: string[] = [];
  if (venue) venueCandidates.push(venue);
  if (venue && location && !locationLoose.includes(venueLoose)) {
    venueCandidates.push(`${venue}, ${location}`);
  }
  if (location) venueCandidates.push(location);

  for (const candidate of venueCandidates) {
    const geocoded = await geocodeToponymBestEffort(candidate);
    if (geocoded.coords) {
      return { query: geocoded.query, coords: geocoded.coords, priority: 1 };
    }
  }

  // Priority 2-3 fallback to Stockholm toponym extraction from text.
  const textBlob = `${raw.title} ${raw.summary ?? ""} ${venue} ${location}`.trim();
  return geocodeStockholmNewsToponymFromText(textBlob);
}

export async function normalizeCultureEvent(raw: RawCultureEvent): Promise<EventItem | null> {
  const eventStartIso = toIsoOrNull(raw.event_start);
  if (!eventStartIso) return null;

  const geocoded = await geocodeCultureBestEffort(raw);

  if (!hasCoords(raw.lat, raw.lng) && !geocoded) {
    // Requirement: ignore items without Stockholm-lan toponyms.
    return null;
  }

  const priorityConfidence: Record<1 | 2 | 3, number> = {
    1: 0.9,
    2: 0.8,
    3: 0.7,
  };
  const hasDirectCoords = hasCoords(raw.lat, raw.lng);
  const directCoords = hasDirectCoords ? { lat: raw.lat, lng: raw.lng as number } : null;
  const hasVenue = normalizeText(raw.venue || "").length > 0;
  const locationValue = normalizeText(raw.location_name || "");
  const isVenuePriorityGeocode = geocoded?.priority === 1;
  const directVsGeocodedDistanceKm =
    directCoords && geocoded?.coords
      ? distanceKm(directCoords.lat, directCoords.lng, geocoded.coords.lat, geocoded.coords.lng)
      : 0;
  const shouldPreferGeocodedOverDirect =
    hasVenue &&
    isVenuePriorityGeocode &&
    (
      isCoarseStockholmLocation(locationValue) ||
      (!isCoarseStockholmLocation(locationValue) && directVsGeocodedDistanceKm > 0.8)
    );
  const finalCoords = shouldPreferGeocodedOverDirect
    ? geocoded?.coords ?? directCoords
    : directCoords ?? geocoded?.coords ?? null;
  const finalConfidence = shouldPreferGeocodedOverDirect
    ? 0.95
    : hasDirectCoords
      ? 0.95
      : geocoded
        ? priorityConfidence[geocoded.priority]
        : 0.6;

  return {
    id: raw.id,
    title: raw.title,
    source: raw.source,
    source_url: raw.source_url,
    source_type: "culture",
    category: "culture",
    location_name: buildLocationLabel(raw.venue, raw.location_name || geocoded?.query || null),
    lat: finalCoords?.lat ?? null,
    lng: finalCoords?.lng ?? null,
    created_at: eventStartIso,
    summary: raw.summary ?? null,
    confidence: finalConfidence,
    event_start: eventStartIso,
    event_end: toIsoOrNull(raw.event_end),
    venue: raw.venue ?? null,
    is_future_event: true,
    geocoding_failed: !finalCoords,
  } satisfies EventItem;
}
