import { XMLParser } from "fast-xml-parser";
import { getNewsSources, type NewsFeedConfig } from "@/lib/config/newsSources";
import type { EventItem } from "@/lib/events/types";
import {
  geocodeStockholmNewsToponymFromText,
  geocodeToponymBestEffort,
} from "@/lib/events/locationExtraction";

export type NewsFeedItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  published_at: string | null;
  summary: string | null;
};

const newsArticleTextCache: Record<string, string | null> = {};

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function fixMojibake(value: string): string {
  const looksBroken = /Ãƒ.|Ã‚./.test(value);
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

function detectCharsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = contentType.match(/charset\s*=\s*([^\s;]+)/i);
  return match?.[1]?.trim() ?? null;
}

function detectCharsetFromXmlProlog(asciiPrefix: string): string | null {
  const match = asciiPrefix.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
  return match?.[1]?.trim() ?? null;
}

function normalizeEncodingName(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower === "utf8") return "utf-8";
  if (lower === "utf-16") return "utf-16";
  if (lower === "iso-8859-1" || lower === "latin1" || lower === "iso8859-1") return "iso-8859-1";
  if (lower === "windows-1252" || lower === "cp1252") return "windows-1252";
  return value.trim();
}

async function readXmlText(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  const asciiPrefix = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 256));

  const contentTypeEncoding = detectCharsetFromContentType(response.headers.get("content-type"));
  const prologEncoding = detectCharsetFromXmlProlog(asciiPrefix);
  const preferred = normalizeEncodingName(prologEncoding || contentTypeEncoding || "utf-8");

  const candidates = Array.from(
    new Set([preferred, "windows-1252", "iso-8859-1", "utf-8"].map(normalizeEncodingName)),
  );

  let bestText = "";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const encoding of candidates) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      const score = (text.match(/\uFFFD/g) ?? []).length;
      if (score < bestScore) {
        bestScore = score;
        bestText = text;
      }
      if (bestScore === 0) break;
    } catch {
      // continue
    }
  }

  return bestText;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtmlBoilerplate(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function extractArticleHtml(value: string): string | null {
  const articleMatch = value.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) return articleMatch[0];
  const mainMatch = value.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) return mainMatch[0];
  return null;
}

async function fetchNewsArticleContext(url: string): Promise<string | null> {
  if (!url) return null;
  if (url in newsArticleTextCache) return newsArticleTextCache[url];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      newsArticleTextCache[url] = null;
      return null;
    }

    const html = await response.text();
    const articleHtml = extractArticleHtml(html) || html;
    const cleaned = stripHtml(stripHtmlBoilerplate(articleHtml)).replace(/\s+/g, " ").trim();
    const limited = cleaned.slice(0, 6000);
    newsArticleTextCache[url] = limited.length > 0 ? limited : null;
    return newsArticleTextCache[url];
  } catch {
    newsArticleTextCache[url] = null;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function safeDateToIso(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeCreatedAt(value: string | null): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function safeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function extractRssLink(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return asText(obj.href || obj.url || obj["#text"]);
  }
  return "";
}

function firstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    const text = asText(value);
    if (text.length > 0) return text;
  }
  return "";
}

function parseRssItems(parsed: unknown, feed: NewsFeedConfig, perFeedLimit: number): NewsFeedItem[] {
  const root = parsed as { rss?: { channel?: { title?: unknown; item?: unknown } } };
  const channel = root?.rss?.channel;
  const rawItems = channel?.item;
  const entries: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const feedTitle = fixMojibake(asText(channel?.title)) || feed.source;

  return entries.slice(0, perFeedLimit).map((entry) => {
    const item = entry as Record<string, unknown>;
    const title = fixMojibake(firstNonEmpty([item.title]));
    const link = extractRssLink(item.link);
    const guid = firstNonEmpty([item.guid]);
    const pubDate = firstNonEmpty([item.pubDate, item.published, item.updated]);
    const rawDescription = firstNonEmpty([item.description, item.summary, item["content:encoded"]]);
    const summary = rawDescription ? stripHtml(fixMojibake(rawDescription)) : null;

    return {
      id: guid || link || `${title}:${pubDate}`,
      title: title || "Nyhet",
      link,
      source: feedTitle,
      published_at: pubDate ? safeDateToIso(pubDate) : null,
      summary: summary && summary.length > 0 ? summary : null,
    } satisfies NewsFeedItem;
  });
}

function parseAtomItems(parsed: unknown, feed: NewsFeedConfig, perFeedLimit: number): NewsFeedItem[] {
  const root = parsed as { feed?: { title?: unknown; entry?: unknown } };
  const atomFeed = root?.feed;
  const rawEntries = atomFeed?.entry;
  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : rawEntries ? [rawEntries] : [];
  const feedTitle = fixMojibake(asText(atomFeed?.title)) || feed.source;

  return entries.slice(0, perFeedLimit).map((entry) => {
    const item = entry as Record<string, unknown>;
    const title = fixMojibake(firstNonEmpty([item.title]));

    const linkValue = item.link;
    let link = "";
    if (Array.isArray(linkValue)) {
      link = extractRssLink(
        linkValue.find((candidate) => asText((candidate as Record<string, unknown>)?.rel) !== "self") ??
          linkValue[0],
      );
    } else {
      link = extractRssLink(linkValue);
    }

    const guid = firstNonEmpty([item.id]);
    const published = firstNonEmpty([item.published, item.updated]);
    const summaryRaw = firstNonEmpty([item.summary, item.content]);
    const summary = summaryRaw ? stripHtml(fixMojibake(summaryRaw)) : null;

    return {
      id: guid || link || `${title}:${published}`,
      title: title || "Nyhet",
      link,
      source: feedTitle,
      published_at: published ? safeDateToIso(published) : null,
      summary: summary && summary.length > 0 ? summary : null,
    } satisfies NewsFeedItem;
  });
}

async function fetchSingleFeed(feed: NewsFeedConfig, perFeedLimit: number): Promise<NewsFeedItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(feed.url, {
      method: "GET",
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Feed request failed: ${response.status}`);
    }

    const xml = await readXmlText(response);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
      parseTagValue: false,
    });

    const parsed = parser.parse(xml);
    const rssItems = parseRssItems(parsed, feed, perFeedLimit);
    if (rssItems.length > 0) return rssItems;

    return parseAtomItems(parsed, feed, perFeedLimit);
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeNewsItems(items: NewsFeedItem[]): NewsFeedItem[] {
  const byKey = new Map<string, NewsFeedItem>();

  for (const item of items) {
    const key = (item.link || item.id || item.title).trim().toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

function sanitizeId(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return cleaned.length > 0 ? cleaned : `news-${Date.now()}`;
}

function normalizeToponymText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isToponymMentionedInText(toponym: string, text: string): boolean {
  const normalizedToponym = normalizeToponymText(toponym);
  const normalizedText = normalizeToponymText(text);
  if (!normalizedToponym || !normalizedText) return false;
  if (normalizedText.includes(normalizedToponym)) return true;
  // Allow Swedish possessive/plural tail for district names (e.g. "Midsommarkransens")
  if (normalizedText.includes(`${normalizedToponym}s`)) return true;
  return false;
}

function isGenericTransitHubToponym(toponym: string): boolean {
  const value = normalizeToponymText(toponym);
  return value === "gullmarsplan" || value === "slussen" || value === "t-centralen";
}

function detectForcedNewsToponym(value: string): string | null {
  const normalized = normalizeToponymText(value);
  if (normalized.includes("midsommarkransen")) return "Midsommarkransen";
  if (normalized.includes(" i kransen") || normalized.includes(" kransen ")) {
    return "Midsommarkransen";
  }
  return null;
}

export async function fetchNewsFeedItems(limit = 30): Promise<NewsFeedItem[]> {
  const newsFeeds = getNewsSources();
  if (newsFeeds.length === 0) return [];

  const perFeedLimit = Math.max(8, Math.ceil(limit / newsFeeds.length) + 4);

  const results = await Promise.allSettled(
    newsFeeds.map((feed) => fetchSingleFeed(feed, perFeedLimit)),
  );

  const parsedItems = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const unavailable = results
    .map((result, index) => (result.status === "rejected" ? newsFeeds[index].source : null))
    .filter((value): value is string => value !== null);

  const deduped = dedupeNewsItems(parsedItems)
    .filter((item) => item.link.length > 0)
    .sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, limit);

  console.info(
    `[newsFeedService] feeds=${newsFeeds.length} unavailable=${unavailable.length} parsed_items=${deduped.length}`,
  );

  return deduped;
}

export async function fetchNewsEvents(limit = 30): Promise<EventItem[]> {
  const items = await fetchNewsFeedItems(limit);

  const normalized = await Promise.all(
    items.map(async (item) => {
      const textBlob = `${item.title} ${item.summary ?? ""}`.trim();
      let geocoded = await geocodeStockholmNewsToponymFromText(textBlob);
      const forcedToponymFromFeed = detectForcedNewsToponym(textBlob);
      if (forcedToponymFromFeed) {
        const forced = await geocodeToponymBestEffort(forcedToponymFromFeed);
        if (forced.coords) {
          geocoded = { query: forced.query, coords: forced.coords, priority: 2 };
        }
      }
      if (!geocoded && item.link) {
        const articleContext = await fetchNewsArticleContext(item.link);
        if (articleContext) {
          const combinedContext = `${item.title} ${item.summary ?? ""} ${articleContext}`.trim();
          geocoded = await geocodeStockholmNewsToponymFromText(combinedContext);
          const forcedToponymFromArticle = detectForcedNewsToponym(combinedContext);
          if (forcedToponymFromArticle) {
            const forced = await geocodeToponymBestEffort(forcedToponymFromArticle);
            if (forced.coords) {
              geocoded = { query: forced.query, coords: forced.coords, priority: 2 };
            }
          }
        }
      }

      if (
        geocoded &&
        isGenericTransitHubToponym(geocoded.query) &&
        !isToponymMentionedInText(geocoded.query, textBlob)
      ) {
        // Avoid false pins caused by noisy article context (ads/nav/footer).
        geocoded = null;
      }

      // Requirement: ignore feed items that do not contain a Stockholm-lan toponym.
      if (!geocoded) return null;

      const confidenceByPriority: Record<1 | 2 | 3, number> = {
        1: 0.9,
        2: 0.75,
        3: 0.6,
      };

      return {
        id: sanitizeId(`news-${item.id}`),
        title: item.title,
        source: item.source || "Nyheter",
        source_url: item.link,
        source_type: "news",
        category: "local_news",
        location_name: geocoded.query,
        lat: geocoded.coords.lat,
        lng: geocoded.coords.lng,
        geocoding_failed: false,
        created_at: safeCreatedAt(item.published_at),
        summary: item.summary,
        confidence: safeConfidence(confidenceByPriority[geocoded.priority]),
      } satisfies EventItem;
    }),
  );

  return normalized.filter((item) => item !== null) as EventItem[];
}
