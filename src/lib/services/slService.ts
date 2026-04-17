import type { EventItem } from "@/lib/events/types";
import { geocodeLocationName } from "@/lib/geocoding/nominatim";
import {
  extractPrioritizedToponymFromText,
  geocodeToponymBestEffort,
} from "@/lib/events/locationExtraction";

type SlMessageVariant = {
  header?: string;
  details?: string;
  language?: string;
};

type SlStopArea = {
  name?: string;
};

type SlDeviation = {
  deviation_case_id?: number;
  created?: string;
  message_variants?: SlMessageVariant[];
  scope?: {
    stop_areas?: SlStopArea[];
  };
};

const SL_DEVIATIONS_URL = "https://deviations.integration.sl.se/v1/messages";
const SL_SOURCE_URL = "https://sl.se/trafikinformation";
function normalizeCreatedAt(value?: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeTitle(message: SlDeviation): string {
  const sv = message.message_variants?.find((item) => item.language === "sv");
  const candidate = sv?.header || sv?.details || message.message_variants?.[0]?.header;
  return candidate || "SL trafikavvikelse";
}


async function normalizeDeviation(message: SlDeviation): Promise<EventItem | null> {
  const fallbackId =
    String(message.created ?? "no-date").replace(/[^0-9a-zA-Z]/g, "") || "unknown";
  
  const title = normalizeTitle(message);
  const svVariant = message.message_variants?.find((v) => v.language === "sv");
  const details = svVariant?.details || "";
  const textBlob = `${title} ${details}`.trim();

  const stopAreaName = message.scope?.stop_areas?.[0]?.name;
  const extractedToponym = extractPrioritizedToponymFromText(textBlob);
  
  // Priority: 1) Specific stop area, 2) extracted toponym from text, 3) fallback "Stockholm"
  const locationName = stopAreaName || extractedToponym || "Stockholm";
  
  const geocodedResult = await geocodeToponymBestEffort(locationName);
  const finalLocationName = geocodedResult?.query || locationName;
  const coords = geocodedResult?.coords || null;

  // We only show it if we have a specific location OR if we explicitly found a toponym.
  // We still filter out generic "Stockholm" to avoid map clutter.
  if (finalLocationName.toLowerCase() === "stockholm" && !coords) {
    return null;
  }

  return {
    id: `sl-${String(message.deviation_case_id ?? fallbackId)}`,
    title,
    source: "SL",
    source_url: SL_SOURCE_URL,
    source_type: "sl",
    category: "traffic",
    location_name: finalLocationName,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    created_at: normalizeCreatedAt(message.created),
    geocoding_failed: !coords,
    summary: details || null,
    confidence: coords ? 0.75 : 0.35,
  };
}

export async function fetchSlDeviationEvents(limit = 30): Promise<EventItem[]> {
  // External source fetch. Any thrown error is handled upstream in /api/events route.
  const response = await fetch(SL_DEVIATIONS_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SL API request failed: ${response.status}`);
  }

  const raw = (await response.json()) as SlDeviation[];
  // Normalize deviations into the internal EventItem schema.
  const normalized = await Promise.all(raw.slice(0, limit).map(normalizeDeviation));
  return normalized.filter((item): item is EventItem => item !== null);
}
