import fs from "fs/promises";
import path from "path";
import type { EventItem, EventsApiResponse } from "@/lib/events/types";
import { fetchPolisenEvents } from "@/lib/services/polisenService";
import { fetchSlDeviationEvents } from "@/lib/services/slService";
import { fetchNewsEvents } from "@/lib/services/newsFeedService";
import { fetchVisitStockholmCultureEvents } from "@/lib/services/visitStockholmCultureService";
import { fetchTicketmasterCultureEvents } from "@/lib/services/ticketmasterCultureService";
import { fetchTicksterCultureEvents } from "@/lib/services/ticksterCultureService";
import {
  loadEventsFromCache,
  mergeAndPruneEvents,
  saveEventsToCache,
} from "@/lib/storage/eventCache";

type CachedSourceEntry = {
  expiresAt: number;
  events: EventItem[];
  unavailable: boolean;
  lastDurationMs: number;
};

type SnapshotEnvelope = {
  updatedAt: number;
  response: EventsApiResponse;
};

type SourceResult = {
  label: string;
  events: EventItem[];
  unavailable: boolean;
  cacheStatus: "hit" | "miss";
  durationMs: number;
};

const SNAPSHOT_FILE_PATH = path.join(process.cwd(), "data", "events_snapshot.json");
const SNAPSHOT_REFRESH_INTERVAL_MS = 30_000;
const SOURCE_TTL_MS = {
  polisen: 90_000,
  sl: 90_000,
  news: 5 * 60_000,
  visitStockholm: 30 * 60_000,
  ticketmaster: 30 * 60_000,
  tickster: 30 * 60_000,
} as const;

const sourceCache = new Map<string, CachedSourceEntry>();
let snapshotCache: SnapshotEnvelope | null = null;
let snapshotLoaded = false;
let refreshInFlight: Promise<void> | null = null;

const EMPTY_RESPONSE: EventsApiResponse = {
  events: [],
  meta: { unavailable_sources: [] },
};

function nowMs(): number {
  return Date.now();
}

function ensureReasonableSummary(summary?: string | null): string | null {
  if (!summary) return null;
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (normalized.length <= 280) return normalized;
  return `${normalized.slice(0, 277)}...`;
}

function fixMojibake(value: string): string {
  const looksBroken = /Ã.|Â./.test(value);
  if (!looksBroken) return value;

  try {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

function normalizeEventTextEncoding(event: EventItem): EventItem {
  return {
    ...event,
    title: fixMojibake(event.title),
    source: fixMojibake(event.source),
    location_name: fixMojibake(event.location_name),
    summary: event.summary ? fixMojibake(event.summary) : event.summary,
    venue: event.venue ? fixMojibake(event.venue) : event.venue,
  };
}

function canonicalResponseEventId(event: EventItem): string {
  const isPolisen = event.source_type === "polisen" || event.source === "Polisen" || event.category === "crime";
  if (!isPolisen) return event.id;
  const rawId = String(event.id ?? "").trim();
  if (!rawId) return "polisen-unknown";
  return rawId.startsWith("polisen-") ? rawId : `polisen-${rawId}`;
}

function isRemovedNewsSource(event: EventItem): boolean {
  if (!(event.source_type === "news" || event.category === "local_news")) return false;
  const source = (event.source || "").toLowerCase();
  const url = (event.source_url || "").toLowerCase();
  return source.includes("tv4") || url.includes("tv4.se");
}

function countCrimeEvents(events: EventItem[]): number {
  return events.filter((event) => event.category === "crime" || event.source_type === "polisen").length;
}

function normalizeLooseText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function patchKnownNewsToponym(event: EventItem): EventItem {
  if (!(event.source_type === "news" || event.category === "local_news")) return event;

  const combinedText = normalizeLooseText(`${event.title || ""} ${event.summary || ""}`);
  const currentLocation = normalizeLooseText(event.location_name || "");
  const mentionsMidsommarkransen =
    combinedText.includes("midsommarkransen") ||
    combinedText.includes(" i kransen") ||
    combinedText.includes(" kransen ");

  if (!mentionsMidsommarkransen) return event;
  if (currentLocation === "midsommarkransen") return event;
  if (currentLocation !== "gullmarsplan") return event;

  return {
    ...event,
    location_name: "Midsommarkransen",
    lat: 59.30154,
    lng: 18.01015,
    confidence: Math.max(event.confidence ?? 0.75, 0.85),
  };
}

function patchKnownPolisenToponym(event: EventItem): EventItem {
  if (event.source_type !== "polisen" && event.source !== "Polisen" && event.category !== "crime") {
    return event;
  }

  const location = normalizeLooseText(event.location_name || "");
  if (location !== "haninge") return event;

  const combined = normalizeLooseText(`${event.title || ""} ${event.summary || ""}`);
  if (combined.includes(" i vega")) {
    return {
      ...event,
      location_name: "Vega",
      lat: 59.1689,
      lng: 18.1349,
      confidence: Math.max(event.confidence ?? 0.9, 0.95),
    };
  }
  if (combined.includes(" i tungelsta")) {
    return {
      ...event,
      location_name: "Tungelsta",
      lat: 59.1009,
      lng: 18.0469,
      confidence: Math.max(event.confidence ?? 0.9, 0.95),
    };
  }

  return event;
}

function patchKnownPolisenHuddingeToponym(event: EventItem): EventItem {
  if (event.source_type !== "polisen" && event.source !== "Polisen" && event.category !== "crime") {
    return event;
  }
  const location = normalizeLooseText(event.location_name || "");
  if (location !== "huddinge") return event;

  const combined = normalizeLooseText(`${event.title || ""} ${event.summary || ""}`);
  if (combined.includes(" i flemingsberg")) {
    return {
      ...event,
      location_name: "Flemingsberg",
      lat: 59.2207,
      lng: 17.9482,
      confidence: Math.max(event.confidence ?? 0.9, 0.95),
    };
  }
  if (combined.includes(" flemingsbergs station")) {
    return {
      ...event,
      location_name: "Flemingsbergs station",
      lat: 59.21952,
      lng: 17.94557,
      confidence: Math.max(event.confidence ?? 0.9, 0.95),
    };
  }
  return event;
}

function shouldDropLikelyMisplacedNewsHubPin(event: EventItem): boolean {
  if (!(event.source_type === "news" || event.category === "local_news")) return false;

  const location = normalizeLooseText(event.location_name || "");
  if (location !== "gullmarsplan") return false;

  const combined = normalizeLooseText(`${event.title || ""} ${event.summary || ""}`);
  // Keep only explicit Gullmarsplan mentions; drop likely mis-geocoded hub pins.
  return !combined.includes("gullmarsplan");
}

function optimizeEventsForMap(events: EventItem[]): EventItem[] {
  const deduped = new Map<string, EventItem>();
  for (const event of events) {
    if (isRemovedNewsSource(event)) continue;
    const encodedFixed = normalizeEventTextEncoding(event);
    const patchedNews = patchKnownNewsToponym(encodedFixed);
    const patchedPolisen = patchKnownPolisenToponym(patchedNews);
    const patched = patchKnownPolisenHuddingeToponym(patchedPolisen);
    if (shouldDropLikelyMisplacedNewsHubPin(patched)) continue;
    const next = {
      ...patched,
      id: canonicalResponseEventId(patched),
      summary: ensureReasonableSummary(patched.summary),
    };
    deduped.set(next.id, next);
  }
  return Array.from(deduped.values());
}

async function saveSnapshotToDisk(snapshot: SnapshotEnvelope): Promise<void> {
  try {
    const dir = path.dirname(SNAPSHOT_FILE_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(SNAPSHOT_FILE_PATH, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch {
    console.error("[eventsPipeline] step=snapshot-save status=error");
  }
}

async function loadSnapshotFromDisk(): Promise<void> {
  if (snapshotLoaded) return;
  snapshotLoaded = true;

  try {
    const fileContent = await fs.readFile(SNAPSHOT_FILE_PATH, "utf-8");
    const parsed = JSON.parse(fileContent.replace(/^\uFEFF/, "")) as SnapshotEnvelope;
    if (
      parsed &&
      typeof parsed.updatedAt === "number" &&
      parsed.response &&
      Array.isArray(parsed.response.events) &&
      parsed.response.meta &&
      Array.isArray(parsed.response.meta.unavailable_sources)
    ) {
      snapshotCache = parsed;
      console.info(
        `[eventsPipeline] step=snapshot-load status=ok events=${parsed.response.events.length}`,
      );
      return;
    }
  } catch {
    // no-op
  }

  snapshotCache = null;
  console.info("[eventsPipeline] step=snapshot-load status=empty");
}

async function fetchSourceWithTtl(
  key: string,
  label: string,
  ttlMs: number,
  fetcher: () => Promise<EventItem[]>,
): Promise<SourceResult> {
  const startedAt = nowMs();
  const cached = sourceCache.get(key);
  if (cached && cached.expiresAt > startedAt) {
    return {
      label,
      events: cached.events,
      unavailable: cached.unavailable,
      cacheStatus: "hit",
      durationMs: nowMs() - startedAt,
    };
  }

  try {
    const events = await fetcher();
    const durationMs = nowMs() - startedAt;
    sourceCache.set(key, {
      expiresAt: nowMs() + ttlMs,
      events,
      unavailable: false,
      lastDurationMs: durationMs,
    });
    return { label, events, unavailable: false, cacheStatus: "miss", durationMs };
  } catch {
    const fallbackEvents = cached?.events ?? [];
    const durationMs = nowMs() - startedAt;
    sourceCache.set(key, {
      expiresAt: nowMs() + ttlMs,
      events: fallbackEvents,
      unavailable: true,
      lastDurationMs: durationMs,
    });
    return {
      label,
      events: fallbackEvents,
      unavailable: true,
      cacheStatus: "miss",
      durationMs,
    };
  }
}

function logSourceTiming(result: SourceResult): void {
  console.info(
    `[eventsPipeline] step=source name=${result.label} cache=${result.cacheStatus} ms=${result.durationMs} count=${result.events.length} unavailable=${result.unavailable}`,
  );
}

async function rebuildSnapshot(reason: string): Promise<void> {
  const pipelineStartedAt = nowMs();
  console.info(`[eventsPipeline] step=refresh-start reason=${reason}`);

  const sourceStartedAt = nowMs();
  const [
    polisen,
    sl,
    news,
    visitStockholm,
    ticketmaster,
    tickster,
    existingEventsResult,
  ] = await Promise.all([
    fetchSourceWithTtl("polisen", "Polisen", SOURCE_TTL_MS.polisen, () => fetchPolisenEvents(500)),
    fetchSourceWithTtl("sl", "SL", SOURCE_TTL_MS.sl, () => fetchSlDeviationEvents(60)),
    fetchSourceWithTtl("news", "Nyheter", SOURCE_TTL_MS.news, () => fetchNewsEvents(120)),
    fetchSourceWithTtl("visitStockholm", "Visit Stockholm", SOURCE_TTL_MS.visitStockholm, () =>
      fetchVisitStockholmCultureEvents(100),
    ),
    fetchSourceWithTtl("ticketmaster", "Ticketmaster", SOURCE_TTL_MS.ticketmaster, () =>
      fetchTicketmasterCultureEvents(100),
    ),
    fetchSourceWithTtl("tickster", "Tickster", SOURCE_TTL_MS.tickster, () =>
      fetchTicksterCultureEvents(100),
    ),
    loadEventsFromCache(),
  ]);
  console.info(`[eventsPipeline] step=sources-collected ms=${nowMs() - sourceStartedAt}`);

  logSourceTiming(polisen);
  logSourceTiming(sl);
  logSourceTiming(news);
  logSourceTiming(visitStockholm);
  logSourceTiming(ticketmaster);
  logSourceTiming(tickster);

  const normalizeStartedAt = nowMs();
  const freshEvents = [
    ...polisen.events,
    ...sl.events,
    ...news.events,
    ...visitStockholm.events,
    ...ticketmaster.events,
    ...tickster.events,
  ];
  const mergedEvents = mergeAndPruneEvents(existingEventsResult, freshEvents);
  const optimizedEvents = optimizeEventsForMap(mergedEvents);
  console.info(
    `[eventsPipeline] step=merge-rank ms=${nowMs() - normalizeStartedAt} merged=${mergedEvents.length} response=${optimizedEvents.length}`,
  );

  const persistStartedAt = nowMs();
  await saveEventsToCache(mergedEvents);

  const unavailableSources = [
    ...(polisen.unavailable ? ["Polisen"] : []),
    ...(sl.unavailable ? ["SL"] : []),
    ...(news.unavailable ? ["Nyheter"] : []),
    ...(visitStockholm.unavailable ? ["Visit Stockholm"] : []),
    ...(ticketmaster.unavailable ? ["Ticketmaster"] : []),
    ...(tickster.unavailable ? ["Tickster"] : []),
  ];

  snapshotCache = {
    updatedAt: nowMs(),
    response: {
      events: optimizedEvents,
      meta: { unavailable_sources: unavailableSources },
    },
  };

  await saveSnapshotToDisk(snapshotCache);
  console.info(`[eventsPipeline] step=persist ms=${nowMs() - persistStartedAt}`);
  console.info(`[eventsPipeline] step=refresh-done ms=${nowMs() - pipelineStartedAt}`);
}

function isSnapshotStale(snapshot: SnapshotEnvelope | null): boolean {
  if (!snapshot) return true;
  return nowMs() - snapshot.updatedAt > SNAPSHOT_REFRESH_INTERVAL_MS;
}

async function refreshSnapshot(reason: string): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = rebuildSnapshot(reason).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function getEventsSnapshot(): Promise<EventsApiResponse> {
  const requestStartedAt = nowMs();
  await loadSnapshotFromDisk();

  if (!snapshotCache) {
    const existing = await loadEventsFromCache();
    const initialEvents = optimizeEventsForMap(existing);
    if (initialEvents.length > 0) {
      snapshotCache = {
        updatedAt: nowMs(),
        response: {
          events: initialEvents,
          meta: { unavailable_sources: [] },
        },
      };
      void saveSnapshotToDisk(snapshotCache);
      void refreshSnapshot("cold-start-background");
    } else {
      await refreshSnapshot("cold-start-blocking");
    }
  } else if (isSnapshotStale(snapshotCache)) {
    void refreshSnapshot("background-stale");
  }

  // One-time compatibility migration:
  // Older snapshots could underrepresent Polisen events due response truncation.
  // If cache history has materially more crime events, rebuild the snapshot from history.
  if (snapshotCache) {
    const historyEvents = await loadEventsFromCache();
    const snapshotCrimeCount = countCrimeEvents(snapshotCache.response.events);
    const historyCrimeCount = countCrimeEvents(historyEvents);
    if (historyCrimeCount > snapshotCrimeCount + 5) {
      snapshotCache = {
        updatedAt: nowMs(),
        response: {
          events: optimizeEventsForMap(historyEvents),
          meta: snapshotCache.response.meta,
        },
      };
      void saveSnapshotToDisk(snapshotCache);
      void refreshSnapshot("snapshot-crime-migration");
    }
  }

  const rawResponse = snapshotCache?.response ?? EMPTY_RESPONSE;
  const response: EventsApiResponse = {
    events: optimizeEventsForMap(rawResponse.events),
    meta: rawResponse.meta,
  };
  console.info(
    `[eventsPipeline] step=request-served ms=${nowMs() - requestStartedAt} events=${response.events.length} stale=${isSnapshotStale(snapshotCache)}`,
  );
  return response;
}
