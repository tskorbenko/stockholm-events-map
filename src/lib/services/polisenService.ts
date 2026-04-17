import type { EventCategory, EventItem } from "@/lib/events/types";
import {
  geocodeLocationName,
  getStockholmFallbackCoordinates,
} from "@/lib/geocoding/nominatim";
import {
  STOCKHOLM_TARGETED_LOCALITIES,
  extractPrioritizedToponymFromTextPreferSpecific,
  geocodeToponymBestEffort,
} from "@/lib/events/locationExtraction";

type PolisenLocation = {
  name?: string;
  gps?: string;
};

type PolisenIncident = {
  id: number | string;
  datetime?: string;
  name?: string;
  summary?: string;
  url?: string;
  type?: string;
  location?: PolisenLocation;
};

const POLISEN_EVENTS_URL = "https://polisen.se/api/events";
const POLISEN_BASE_URL = "https://polisen.se";
const detailHtmlCache: Record<string, string | null> = {};
const detailPublishedCache: Record<string, string | null> = {};
const detailCleanTextCache: Record<string, string | null> = {};
const detailSummaryCache: Record<string, string | null> = {};

function mapCategory(): EventCategory {
  // Requirement: Only SL data should be in the "traffic" category.
  // Requirement: Only Polisen data should be in the "crime" category.
  return "crime";
}

function normalizeDatetime(datetime?: string): string {
  if (!datetime) return new Date().toISOString();
  const normalized = datetime.replace(" ", "T").replace(" +", "+");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function getStockholmOffsetMinutes(atUtcMs: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Stockholm",
      timeZoneName: "shortOffset",
    }).formatToParts(new Date(atUtcMs));
    const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
    const match = zone.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) return 0;

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2] ?? "0");
    const minutes = Number(match[3] ?? "0");
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

function parseSwedishPublishedDatetime(
  text: string,
  fallbackDatetime?: string,
): string | null {
  const fallbackYear = new Date(normalizeDatetime(fallbackDatetime)).getFullYear();
  const monthMap: Record<string, number> = {
    januari: 0,
    februari: 1,
    mars: 2,
    april: 3,
    maj: 4,
    juni: 5,
    juli: 6,
    augusti: 7,
    september: 8,
    oktober: 9,
    november: 10,
    december: 11,
  };

  const match = text.match(
    /Publicerad\s*([0-9]{1,2})\s+([A-Za-zÅÄÖåäö]+)\s+([0-9]{1,2})[.:]([0-9]{2})/i,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const month = monthMap[monthName];
  if (!Number.isFinite(day) || month === undefined) return null;

  // The Polisen "Publicerad" timestamp is in Sweden local time.
  // Convert that Stockholm-local wall clock time to UTC ISO.
  const localAsUtcMs = Date.UTC(fallbackYear, month, day, hour, minute, 0);
  const stockholmOffsetMinutes = getStockholmOffsetMinutes(Date.UTC(fallbackYear, month, day, 12, 0, 0));
  const date = new Date(localAsUtcMs - stockholmOffsetMinutes * 60_000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeLocationMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isStockholmAreaRawLocation(locationName?: string): boolean {
  if (!locationName) return false;
  const text = normalizeLocationMatch(locationName);
  return (
    text.includes("stockholm") ||
    text.includes("sodertalje") ||
    text.includes("norrtalje") ||
    text.includes("sigtuna") ||
    text.includes("nacka") ||
    text.includes("solna") ||
    text.includes("sundbyberg") ||
    text.includes("huddinge") ||
    text.includes("botkyrka") ||
    text.includes("haninge") ||
    text.includes("tyreso") ||
    text.includes("jarfalla") ||
    text.includes("taby") ||
    text.includes("vallentuna") ||
    text.includes("upplands") ||
    text.includes("varmdo") ||
    text.includes("lidingo") ||
    text.includes("osteraker")
  );
}

function toAbsolutePolisenUrl(relativeOrAbsolute?: string): string {
  if (!relativeOrAbsolute) return "https://polisen.se/aktuellt/handelser/";
  if (relativeOrAbsolute.startsWith("http")) return relativeOrAbsolute;
  return `${POLISEN_BASE_URL}${relativeOrAbsolute}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&#229;/g, "å")
    .replace(/&#228;/g, "ä")
    .replace(/&#246;/g, "ö")
    .replace(/&#197;/g, "Å")
    .replace(/&#196;/g, "Ä")
    .replace(/&#214;/g, "Ö")
    .replace(/&amp;/g, "&");
}

function stripHtml(text: string): string {
  const stripped = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const decoded = decodeHtmlEntities(stripped);
  return decoded
    .replace(/&#x([0-9a-f]+);/gi, (full, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
    })
    .replace(/&#([0-9]+);/g, (full, dec) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : full;
    });
}

function stripHtmlBoilerplate(text: string): string {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function looksLikeBoilerplateSentence(sentence: string): boolean {
  const s = normalizeLoose(sentence);
  return (
    s.includes("window._paq") ||
    s.includes("_paq =") ||
    s.includes("requireconsent") ||
    s.includes("enablelinktracking") ||
    s.includes("enableheartbeattimer") ||
    s.includes("polismyndigheten |") ||
    s.includes("polisen.se kakor") ||
    s.includes("sa har anvander polisen.se kakor") ||
    s.includes("anpassa installningar for kakor") ||
    s.includes("nodvandiga kakor") ||
    s.includes("kakor for webbanalys") ||
    s.includes("kakor pa polisen.se") ||
    s.includes("anvander vi nodvandiga kakor") ||
    s.includes("anvander ocksa kakor for webbanalys") ||
    s.includes("for att webbplatsen ska fungera") ||
    s.includes("cookie") ||
    s.includes("samtycke") ||
    s.includes("integritetspolicy")
  );
}

function looksLikeBoilerplateText(text: string): boolean {
  const normalized = normalizeLoose(text);
  if (!normalized) return true;
  return (
    looksLikeBoilerplateSentence(normalized) ||
    normalized.includes("kakor") ||
    normalized.includes("cookie")
  );
}

function extractMetaDescription(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const keyMatch = tag.match(/\b(?:name|property)=["']([^"']+)["']/i);
    const key = keyMatch?.[1]?.toLowerCase() ?? "";
    if (key !== "og:description" && key !== "description" && key !== "twitter:description") continue;
    const contentMatch = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
    const content = contentMatch?.[2] ? normalizeText(stripHtml(contentMatch[2])) : "";
    if (!content) continue;
    if (looksLikeBoilerplateSentence(content)) continue;
    return content;
  }
  return null;
}

function extractArticleHtml(html: string): string | null {
  const articleMatch = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i);
  if (articleMatch?.[0]) return articleMatch[0];

  const mainMatch = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  if (mainMatch?.[0]) return mainMatch[0];

  return null;
}

function buildDetailSummary(
  detailText: string,
  fallbackSummary?: string,
  fallbackTitle?: string,
): string | null {
  let cleaned = normalizeText(detailText);
  if (!cleaned) return null;

  // Drop footer/meta text that is often appended on Polisen pages.
  cleaned = cleaned.replace(/\bText av\b[\s\S]*$/i, "").replace(/\bPublicerad\b[\s\S]*$/i, "").trim();

  const title = normalizeText(fallbackTitle || "");
  const short = normalizeText(fallbackSummary || "");

  if (title && cleaned.toLowerCase().startsWith(title.toLowerCase())) {
    cleaned = cleaned.slice(title.length).trim();
  }

  let body = cleaned;
  if (short) {
    const escapedShort = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`^${escapedShort}\\s*`, "i"), "").trim();
  }

  body = body.replace(/\bPlats:\s*[^\n.]+[.]?/gi, " ").trim();

  const bodySentences = splitSentences(body)
    .filter((sentence) => !looksLikeBoilerplateSentence(sentence))
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 260)
    .slice(0, 2);
  const extra = bodySentences.join(" ").trim();

  if (short && extra) {
    const normalizedShort = normalizeText(short).toLowerCase();
    const normalizedExtra = normalizeText(extra).toLowerCase();
    if (normalizedExtra === normalizedShort || normalizedExtra.startsWith(`${normalizedShort} `)) {
      return extra;
    }
    return `${short} ${extra}`.trim();
  }
  if (short) return short;
  if (extra) return extra;
  return null;
}

function extractSpecificObjectToponym(text: string): string | null {
  const normalizedText = normalizeLocationMatch(text).replace(/\s+/g, " ").trim();
  if (!normalizedText) return null;

  if (normalizedText.includes("bagarsjobadet")) return "Bagarsjöbadet";

  const candidates = Array.from(
    new Set([
      ...STOCKHOLM_TARGETED_LOCALITIES,
      "Bagarsjöbadet",
      "Boo",
      "Nacka Strand",
      "Vårby gård",
    ]),
  );

  const scoredMatches = candidates
    .filter((candidate) => normalizedText.includes(normalizeLocationMatch(candidate)))
    .map((candidate) => {
      const normalizedCandidate = normalizeLocationMatch(candidate);
      const isObjectLike = /\b(badet|arena|hallen|hall|teatern|teater|sjukhuset|skolan|parken|kyrkan|biblioteket|galleria|forum)\b/i.test(
        normalizedCandidate,
      );
      const isBroadArea = normalizedCandidate === "boo";
      const score = (isObjectLike ? 1000 : 0) + (isBroadArea ? -100 : 0) + candidate.length;
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestCandidate = scoredMatches[0]?.candidate ?? null;
  if (!bestCandidate) return null;

  const normalizedBest = normalizeLocationMatch(bestCandidate);
  if (normalizedBest.includes("bagarsj") && normalizedBest.includes("badet")) return "Bagarsjöbadet";
  if (normalizedBest === "boo") return "Boo";

  return bestCandidate;
}

function isCoarsePolisenLocation(locationName: string): boolean {
  const lower = normalizeLocationMatch(locationName).replace(/\s+/g, " ").trim();
  return lower.includes("lan") || lower.includes("okand") || lower === "stockholm" || lower === "nacka";
}

function isStreetLevelToponym(value: string): boolean {
  const normalized = normalizeLocationMatch(value);
  return /(gatan|vagen|grand|torg|plan|alle|allen|leden|bron|platsen)\b/i.test(normalized);
}

function extractStreetToponymFromText(text: string): string | null {
  const streetRegex =
    /\b(?:pa|på|vid|i|till|fran|från|mot)\s+([A-ZÃ…Ã„Ã–][A-Za-zÃ…Ã„Ã–Ã¥Ã¤Ã¶\-]{1,}(?:\s+[A-ZÃ…Ã„Ã–][A-Za-zÃ…Ã„Ã–Ã¥Ã¤Ã¶\-]{1,}){0,2}\s(?:gatan|vÃ¤gen|vagen|grÃ¤nd|grand|allÃ©|allen|torg|plan|leden|bron|platsen))\b/gi;
  let match: RegExpExecArray | null = streetRegex.exec(text);
  while (match) {
    const value = match[1]?.trim().replace(/[.,;:!?]+$/, "");
    if (value && isStreetLevelToponym(value)) return value;
    match = streetRegex.exec(text);
  }
  return null;
}

async function geocodeMunicipalityFallback(locationName: string): Promise<{ lat: number; lng: number } | null> {
  const cleaned = locationName
    .replace(/\bkommun(?:en)?\b/gi, " ")
    .replace(/\bl[aä]n\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const direct = await geocodeLocationName(cleaned);
  if (direct) return direct;

  if (/s$/i.test(cleaned) && cleaned.length > 4) {
    const singular = cleaned.slice(0, -1);
    const singularCoords = await geocodeLocationName(singular);
    if (singularCoords) return singularCoords;
  }

  return null;
}

async function extractDetailPublishedAt(
  detailUrl: string,
  fallbackDatetime?: string,
): Promise<string | null> {
  if (detailUrl in detailPublishedCache) return detailPublishedCache[detailUrl];

  try {
    const cleaned = await getDetailCleanText(detailUrl);
    if (!cleaned) {
      detailPublishedCache[detailUrl] = null;
      return null;
    }

    const published = parseSwedishPublishedDatetime(cleaned, fallbackDatetime);
    detailPublishedCache[detailUrl] = published;
    return published;
  } catch {
    detailPublishedCache[detailUrl] = null;
    return null;
  }
}

async function getDetailCleanText(detailUrl: string): Promise<string | null> {
  if (detailUrl in detailCleanTextCache) return detailCleanTextCache[detailUrl];

  try {
    const html = await getDetailHtml(detailUrl);
    if (!html) {
      detailCleanTextCache[detailUrl] = null;
      return null;
    }
    const articleHtml = extractArticleHtml(html);
    const htmlForText = articleHtml || html;
    const cleaned = stripHtml(stripHtmlBoilerplate(htmlForText));
    detailCleanTextCache[detailUrl] = cleaned || null;
    return detailCleanTextCache[detailUrl];
  } catch {
    detailCleanTextCache[detailUrl] = null;
    return null;
  }
}

async function getDetailHtml(detailUrl: string): Promise<string | null> {
  if (detailUrl in detailHtmlCache) return detailHtmlCache[detailUrl];
  try {
    const response = await fetch(detailUrl, {
      method: "GET",
      headers: { Accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok) {
      detailHtmlCache[detailUrl] = null;
      return null;
    }
    const html = await response.text();
    detailHtmlCache[detailUrl] = html || null;
    return detailHtmlCache[detailUrl];
  } catch {
    detailHtmlCache[detailUrl] = null;
    return null;
  }
}

async function extractDetailSummary(
  detailUrl: string,
  fallbackSummary?: string,
  fallbackTitle?: string,
): Promise<string | null> {
  if (detailUrl in detailSummaryCache) return detailSummaryCache[detailUrl];

  try {
    const [html, cleaned] = await Promise.all([getDetailHtml(detailUrl), getDetailCleanText(detailUrl)]);
    if (!cleaned) {
      detailSummaryCache[detailUrl] = fallbackSummary || null;
      return detailSummaryCache[detailUrl];
    }

    const metaDescription = html ? extractMetaDescription(html) : null;
    const safeMetaDescription =
      metaDescription && !looksLikeBoilerplateText(metaDescription) ? metaDescription : null;
    const summary = buildDetailSummary(
      safeMetaDescription ? `${safeMetaDescription} ${cleaned}` : cleaned,
      fallbackSummary,
      fallbackTitle,
    );
    const safeSummary = summary && !looksLikeBoilerplateText(summary) ? summary : null;
    detailSummaryCache[detailUrl] = safeSummary || fallbackSummary || null;
    return detailSummaryCache[detailUrl];
  } catch {
    detailSummaryCache[detailUrl] = fallbackSummary || null;
    return detailSummaryCache[detailUrl];
  }
}

async function normalizeIncident(item: PolisenIncident): Promise<EventItem | null> {
  if (!isStockholmAreaRawLocation(item.location?.name)) return null;

  const detailUrl = toAbsolutePolisenUrl(item.url);
  const baseLocation = item.location?.name || "Okand plats";
  
  // Strategy: Try to find a more specific location in the summary/name than the coarse municipality location
  const textBlob = `${item.name || ""} ${item.summary || ""}`.trim();
  const extractedToponym = extractPrioritizedToponymFromTextPreferSpecific(textBlob);

  const coarseBaseLocation = isCoarsePolisenLocation(baseLocation);
  const detailToponymPromise = Promise.resolve<string | null>(null);
  
  // Priority: 1) Toponym from text, 2) toponym from detail page, 3) base location name from API
  const detailPublishedAtPromise = extractDetailPublishedAt(detailUrl, item.datetime);
  const detailSummaryPromise = extractDetailSummary(detailUrl, item.summary, item.name);
  const [detailToponym, detailPublishedAt, detailSummary] = await Promise.all([
    detailToponymPromise,
    detailPublishedAtPromise,
    detailSummaryPromise,
  ]);
  const streetToponym = extractStreetToponymFromText(
    `${textBlob} ${detailSummary || ""}`.trim(),
  );

  const targetedFromSummary = extractSpecificObjectToponym(item.summary || "");
  const targetedFromDetail =
    coarseBaseLocation && !targetedFromSummary
      ? extractSpecificObjectToponym(detailSummary || "")
      : null;
  const targetedObjectToponym = targetedFromSummary || targetedFromDetail;
  const combinedToponymText = normalizeLocationMatch(`${item.summary || ""} ${detailSummary || ""}`);
  const forcedBagarsjobadet =
    combinedToponymText.includes("bagarsj") && combinedToponymText.includes("badet")
      ? "Bagarsjöbadet"
      : null;

  const locationName =
    forcedBagarsjobadet ||
    targetedObjectToponym ||
    streetToponym ||
    (extractedToponym && !isCoarsePolisenLocation(extractedToponym)
      ? extractedToponym
      : detailToponym || extractedToponym || baseLocation);

  const geocodingQuery =
    isStreetLevelToponym(locationName) &&
    baseLocation &&
    !normalizeLocationMatch(locationName).includes(normalizeLocationMatch(baseLocation))
      ? `${locationName} ${baseLocation}`
      : locationName;

  const geocodedResult = await geocodeToponymBestEffort(geocodingQuery);
  const finalLocationName = isStreetLevelToponym(locationName)
    ? locationName
    : geocodedResult?.query || locationName;
  
  // Final coordinate selection: prioritize geocoding, then municipality fallback, then Stockholm center.
  const municipalityCoords = geocodedResult?.coords ? null : await geocodeMunicipalityFallback(locationName);
  const coords = geocodedResult?.coords || municipalityCoords || getStockholmFallbackCoordinates();

  return {
    id: `polisen-${String(item.id)}`,
    title: item.summary || item.name || "Polishandelse",
    source: "Polisen",
    source_url: detailUrl,
    source_type: "polisen",
    category: mapCategory(),
    location_name: finalLocationName,
    lat: coords.lat,
    lng: coords.lng,
    created_at: detailPublishedAt || normalizeDatetime(item.datetime),
    geocoding_failed: !(geocodedResult?.coords || municipalityCoords),
    confidence: geocodedResult?.coords || municipalityCoords ? 0.95 : 0.4,
    summary: detailSummary || item.summary || null,
  };
}

export async function fetchPolisenEvents(limit = 50): Promise<EventItem[]> {
  const response = await fetch(POLISEN_EVENTS_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Polisen API request failed: ${response.status}`);
  }

  const raw = (await response.json()) as PolisenIncident[];
  const normalized = await Promise.all(raw.slice(0, limit).map(normalizeIncident));
  return normalized.filter((item): item is EventItem => item !== null);
}
