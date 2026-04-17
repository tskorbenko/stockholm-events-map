import type { EventItem } from "@/lib/events/types";
import { normalizeCultureEvent, type RawCultureEvent } from "@/lib/services/cultureCommon";

const VISIT_STOCKHOLM_SOURCE = "Visit Stockholm";
const VISIT_STOCKHOLM_EVENTS_URL = "https://api.visitstockholm.com/api/public-v1/events/?format=json";
const VISIT_STOCKHOLM_PUBLIC_URL = "https://www.visitstockholm.com/";

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function asLocalizedText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const localized = value as Record<string, unknown>;
  const preferred = [localized.sv, localized.en].map(asText).find(Boolean);
  if (preferred) return preferred;

  for (const raw of Object.values(localized)) {
    const candidate = asText(raw);
    if (candidate) return candidate;
  }
  return "";
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function combineDateAndTime(dateValue: string, timeValue?: string): string {
  const date = asText(dateValue);
  if (!date) return "";
  const time = asText(timeValue);
  if (!time) return `${date}T12:00:00`;
  return `${date}T${time}`;
}

function withVisitStockholmBaseUrl(value: string): string {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ""), VISIT_STOCKHOLM_PUBLIC_URL).toString();
}

function pickNearestScheduleStart(
  item: Record<string, unknown>,
  nowMs = Date.now(),
): { start: string; end: string | null } | null {
  const schedule = (item.schedule as Record<string, unknown> | undefined) ?? null;
  const datesRaw = schedule && Array.isArray(schedule.dates) ? schedule.dates : [];
  if (datesRaw.length === 0) return null;

  const slots = datesRaw
    .map((slotRaw) => {
      const slot = (slotRaw as Record<string, unknown> | undefined) ?? {};
      const date = asText(slot.date);
      const startTime = asText(slot.start_time);
      const endTime = asText(slot.end_time);
      const start = combineDateAndTime(date, startTime);
      if (!start) return null;
      const end = endTime ? combineDateAndTime(date, endTime) : null;
      return { start, end, ts: new Date(start).getTime() };
    })
    .filter((slot): slot is { start: string; end: string | null; ts: number } => Number.isFinite(slot?.ts))
    .sort((a, b) => a.ts - b.ts);

  if (slots.length === 0) return null;
  const upcoming = slots.find((slot) => slot.ts >= nowMs);
  const selected = upcoming ?? slots[slots.length - 1];
  return { start: selected.start, end: selected.end };
}

function mapPublicEventToRaw(item: Record<string, unknown>): RawCultureEvent | null {
  const id = asText(item.id);
  const title = asLocalizedText(item.title);
  const sourceUrl = withVisitStockholmBaseUrl(
    asText(item.external_website_url) || asText(item.url),
  );
  const summary = asLocalizedText(item.description) || null;
  const venue = asText(item.venue_name) || null;
  const city = asText(item.city);
  const address = asText(item.address);
  const locationObj = (item.location as Record<string, unknown> | undefined) ?? {};
  const lat = asNumber(locationObj.latitude);
  const lng = asNumber(locationObj.longitude);

  const scheduledSlot = pickNearestScheduleStart(item);
  const startDate = asText(item.start_date);
  const endDate = asText(item.end_date);
  const startTime = asText(item.start_time);
  const endTime = asText(item.end_time);
  const eventStart = scheduledSlot?.start || combineDateAndTime(startDate, startTime);
  const eventEnd = scheduledSlot?.end ?? (endDate ? combineDateAndTime(endDate, endTime) : null);

  const locationName = [venue, city || "Stockholm"].filter(Boolean).join(", ") || address || "Stockholm";
  if (!id || !title || !sourceUrl || !eventStart) return null;

  return {
    id: `visit-stockholm-${id}`,
    title,
    source: VISIT_STOCKHOLM_SOURCE,
    source_url: sourceUrl,
    summary,
    event_start: eventStart,
    event_end: eventEnd,
    venue,
    location_name: locationName,
    lat,
    lng,
  };
}

async function fetchFromVisitStockholm(limit: number): Promise<RawCultureEvent[]> {
  const collected: RawCultureEvent[] = [];
  let page = 1;
  let pageGuard = 0;

  while (collected.length < limit && pageGuard < 8) {
    pageGuard += 1;
    const pageUrl = `${VISIT_STOCKHOLM_EVENTS_URL}&page=${page}`;
    const response = await fetch(pageUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Visit Stockholm API request failed: ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const mapped = results
      .map((item) => (item && typeof item === "object" ? mapPublicEventToRaw(item as Record<string, unknown>) : null))
      .filter((item): item is RawCultureEvent => item !== null);

    collected.push(...mapped);

    const currentPage = asNumber(payload.current_page) ?? page;
    const totalPages = asNumber(payload.total_pages) ?? currentPage;
    const nextRaw = payload.next;

    if (currentPage < totalPages) {
      page = currentPage + 1;
      continue;
    }

    if (typeof nextRaw === "number" && Number.isFinite(nextRaw) && nextRaw > currentPage) {
      page = Math.floor(nextRaw);
      continue;
    }

    const nextText = asText(nextRaw);
    if (/^\d+$/.test(nextText)) {
      const parsedPage = Number(nextText);
      if (parsedPage > currentPage) {
        page = parsedPage;
        continue;
      }
    }

    break;
  }

  return collected.slice(0, limit);
}

export async function fetchVisitStockholmCultureEvents(limit = 40): Promise<EventItem[]> {
  const sourceTag = "[culture:visit-stockholm]";
  let fetchedCount = 0;
  let normalizedCount = 0;
  let errorCount = 0;

  try {
    const rawEvents = await fetchFromVisitStockholm(limit);
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
