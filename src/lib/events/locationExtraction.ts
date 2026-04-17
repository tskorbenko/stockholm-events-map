import { geocodeLocationName } from "@/lib/geocoding/nominatim";

/**
 * All 26 municipalities of Stockholm County.
 */
export const STOCKHOLM_KOMMUNER = [
  "Botkyrka",
  "Danderyd",
  "Ekerö",
  "Haninge",
  "Huddinge",
  "Järfälla",
  "Lidingö",
  "Nacka",
  "Norrtälje",
  "Nykvarn",
  "Nynäshamn",
  "Salem",
  "Salems",
  "Sigtuna",
  "Sollentuna",
  "Solna",
  "Stockholm",
  "Sundbyberg",
  "Södertälje",
  "Tyresö",
  "Täby",
  "Upplands-Bro",
  "Upplands Bro",
  "Upplands Väsby",
  "Vallentuna",
  "Vaxholm",
  "Värmdö",
  "Österåker",
];

/**
 * Extensive list of Stockholm districts, suburbs, and neighborhoods.
 */
export const STOCKHOLM_STADSDELAR = [
  // Central
  "Norrmalm", "Södermalm", "Östermalm", "Vasastan", "Kungsholmen", "Gamla stan", "Djurgården", "Skeppsholmen", "Reimersholme", "Långholmen", "Riddarholmen",
  // Söderort (South)
  "Fruängen", "Hägersten", "Hägerstensåsen", "Liljeholmen", "Gröndal", "Midsommarkransen", "Aspudden", "Mälarhöjden", "Västertorp", "Örnsberg",
  "Älvsjö", "Örby", "Örby Slott", "Solberga", "Liseberg", "Stureby", "Östberga", "Enskede", "Enskededalen", "Enskedefältet", "Gamla Enskede",
  "Gullmarsplan", "Johanneshov", "Årsta", "Hammarbyhöjden", "Björkhagen", "Kärrtorp", "Sandsborg", "Skogskyrkogården", "Tallkrogen", "Gubbängen", "Hökarängen", "Farsta", "Farsta strand", "Sköndal", "Larsboda", "Fagersjö", "Hökarängen",
  "Hagsätra", "Rågsved", "Högdalen", "Bandhagen", "Svedmyra", "Östberga", "Bagarmossen", "Skarpnäck", "Skärholmen", "Bredäng", "Sätra", "Vårberg", "Vårby", "Vårby gård",
  // Västerort (West)
  "Bromma", "Alvik", "Traneberg", "Ulvsunda", "Abrahamsberg", "Riksby", "Åkeshov", "Ålsten", "Äppelviken", "Smedslätten", "Nockeby", "Nockebyhov", "Höglandet", "Olovslund", "Viksjö",
  "Hässelby", "Hässelby gård", "Hässelby strand", "Hässelby villastad", "Vällingby", "Råcksta", "Blackeberg", "Grimsta", "Kälvesta", "Nälsta", "Vinsta",
  "Spånga", "Bromsten", "Flysta", "Solhem", "Lunda", "Tensta", "Rinkeby", "Akalla", "Husby", "Kista",
  // Suburbs & Other common areas
  "Solna", "Bergshamra", "Haga", "Hagalund", "Huvudsta", "Skytteholm", "Råsunda", "Ulriksdal", "Frösunda", "Järva",
  "Sollentuna", "Edsberg", "Häggvik", "Helenelund", "Norrviken", "Rotebro", "Tureberg", "Viby",
  "Jakobsberg", "Barkarby", "Kallhäll", "Viksjö",
  "Tumba", "Tullinge", "Alby", "Hallunda", "Fittja", "Norsborg",
  "Tyresö", "Bollmora", "Trollbäcken", "Lindalen",
  "Handen", "Jordbro", "Västerhaninge", "Brandbergen", "Vendelsö", "Nacka Strand", "Boo",
  "Åkersberga", "Vaxholm", "Gustavsberg", "Mölnvik",
  "Marsta", "Sigtuna", "Rosersberg",
  "Södertälje", "Geneta", "Hovsjö", "Ronna", "Lina", "Viksängen",
  "Täby", "Täby centrum", "Roslags Näsby", "Enebyberg", "Gribbylund", "Lahäll", "Viggbyholm", "Vallentuna",
];

export const STOCKHOLM_TARGETED_LOCALITIES = [
  // Targeted high-value localities for better precision than municipality-level pins.
  "Flemingsberg",
  "Flemingsbergs station",
  "Vega station",
  "Handen station",
  "Västerhaninge station",
  "Jordbro station",
  "Södertälje centrum",
  "T-Centralen",
  "Vega",
  "Tungelsta",
  "Bagarsjöbadet",
  "Boo",
  "Nacka Strand",
  "Vårby gård",
  "Solna strand",
  "Huddinge centrum",
  "Södertälje centrum",
  "Täby centrum",
  "Jakobsberg centrum",
  "Skärholmen centrum",
  "Farsta centrum",
  "Kista centrum",
  "Hallunda centrum",
  "Brommaplan",
  "Fridhemsplan",
  "Gullmarsplan",
  "T-Centralen",
];

export const STOCKHOLM_PLACES = [
  ...STOCKHOLM_TARGETED_LOCALITIES,
  ...STOCKHOLM_STADSDELAR,
  ...STOCKHOLM_KOMMUNER,
];

const STOCKHOLM_TRANSIT_STATIONS = [
  "Flemingsberg",
  "Flemingsbergs station",
  "Vega station",
  "Handen station",
  "Västerhaninge station",
  "Jordbro station",
  "T-Centralen",
];

export const TOPONYM_TRAILING_STOPWORDS = [
  "badforbud", "badförbud", "brand", "stopp", "forsening", "försening", "utredning",
  "polisen", "sl", "nyheter", "haver", "häver", "omfattas", "avstangt", "avstängt",
  "station", "centrum", "västra", "östra", "södra", "norra", "pa", "på", "i", "vid",
  "mot", "fran", "från", "grund", "och", "till", "mellan", "frano", "fran", "av",
  "ringer", "forsokte", "försökte", "har", "troligen", "sedan", "efter", "vidare",
  "enligt", "ska", "skulle", "misstankt", "misstänkt", "plats",
];

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripToKnownPlacePrefix(value: string): string {
  const normalizedValue = normalizeText(value).replace(/\s+/g, " ").trim();
  if (!normalizedValue) return value;

  let bestMatch: string | null = null;
  for (const place of STOCKHOLM_PLACES) {
    const normalizedPlace = normalizeText(place).replace(/\s+/g, " ").trim();
    if (!normalizedPlace) continue;
    if (
      normalizedValue === normalizedPlace ||
      normalizedValue.startsWith(`${normalizedPlace} `)
    ) {
      if (!bestMatch || normalizedPlace.length > normalizeText(bestMatch).length) {
        bestMatch = place;
      }
    }
  }

  return bestMatch ?? value;
}

export function findStreetToponym(text: string): string | null {
  const streetRegex =
    /\b([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{2,}(?:\s+[A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{2,}){0,3}\s(?:gatan|vägen|vagen|torg|plan|gränd|grand|allé|allen|leden|bron|platsen))\b/g;
  const match = streetRegex.exec(text);
  return match?.[1]?.trim() ?? null;
}

export function findFirstKnownToponym(text: string, candidates: string[]): string | null {
  const lower = normalizeText(text);
  for (const candidate of candidates) {
    if (lower.includes(normalizeText(candidate))) return candidate;
  }
  return null;
}

/**
 * Extracts possible toponyms based on Swedish prepositional patterns.
 */
export function extractToponymCandidatesFromText(text: string): string[] {
  const candidates = new Set<string>();

  // Special high-priority pattern for Polisen summaries (Plats: X)
  const platsMatch = /\bPlats:\s*([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{1,}(?:\s+[A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{1,}){0,2})/i.exec(text);
  if (platsMatch?.[1]) {
    const value = platsMatch[1].trim().replace(/[.,;:!?]+$/, "");
    if (value.length > 2) candidates.add(value);
  }

  // Aggressive pattern for standard prepositions (i, vid, på, pa, från, fran, mot, mellan, till, av)
  const prepositionPattern =
    /\b(?:i|vid|på|pa|från|fran|mot|mellan|till|av)\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{1,}(?:\s+[A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{1,}){0,2})/g;
  let match: RegExpExecArray | null = prepositionPattern.exec(text);
  while (match) {
    const value = match[1].trim().replace(/[.,;:!?]+$/, "");
    const clipped = stripToKnownPlacePrefix(value);
    const cleaned = stripTrailingStopwords(clipped);
    const fallback = stripTrailingStopwords(value);
    const finalValue = cleaned.length > 2 ? cleaned : fallback;
    if (finalValue.length > 2) candidates.add(finalValue);
    match = prepositionPattern.exec(text);
  }

  // Explicit pattern for "i närheten av <object/place>" frequently used in incident texts.
  const nearbyPattern =
    /\bi\s+n[aä]rheten\s+av\s+([A-ZÃ…Ã„Ã–][A-Za-zÃ…Ã„Ã–Ã¥Ã¤Ã¶\-]{1,}(?:\s+[A-ZÃ…Ã„Ã–a-zÃ¥Ã¤Ã¶][A-Za-zÃ…Ã„Ã–Ã¥Ã¤Ã¶\-]{1,}){0,3})/gi;
  match = nearbyPattern.exec(text);
  while (match) {
    const value = match[1].trim().replace(/[.,;:!?]+$/, "");
    if (value.length > 2) candidates.add(value);
    match = nearbyPattern.exec(text);
  }

  // Common Swedish phrasing: "... som Årstaviken"
  const likePattern =
    /\b(?:som)\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{1,}(?:\s+[A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{1,}){0,2})/g;
  match = likePattern.exec(text);
  while (match) {
    const value = match[1].trim().replace(/[.,;:!?]+$/, "");
    if (value.length > 2) candidates.add(value);
    match = likePattern.exec(text);
  }

  // Exact matching for our known list of places
  const lower = normalizeText(text);
  for (const place of STOCKHOLM_PLACES) {
    if (lower.includes(normalizeText(place))) {
      candidates.add(place);
    }
  }

  return Array.from(candidates);
}

function isObjectOrVenueToponym(value: string): boolean {
  const normalized = normalizeText(value);
  return /\b(badet|arena|hallen|hall|teatern|teater|sjukhuset|skolan|parken|centrum|station(?:en)?|kyrkan|biblioteket|galleria(?:n)?|forum)\b/i.test(
    normalized,
  );
}

function isTransitStationToponym(value: string): boolean {
  const normalized = normalizeText(value).replace(/\s+/g, " ").trim();
  if (
    /\b(station(?:en)?|tunnelbanestation|pendeltagsstation|t-centralen)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return STOCKHOLM_TRANSIT_STATIONS.some(
    (item) => normalizeText(item).replace(/\s+/g, " ").trim() === normalized,
  );
}

export function toponymPriority(value: string): number {
  const lower = normalizeText(value);
  const streetLike =
    /(gatan|vägen|vagen|torg|plan|gränd|grand|allé|allen|leden|bron|platsen)\b/i.test(
      value,
    );
  // Priority model:
  // 1) Venue/Object
  // 2) Transit station toponym (highest precision after venues)
  // 3) Street/Square
  // 3) District/Locality
  // 4) Municipality
  // 5) Stockholm fallback
  if (isTransitStationToponym(value)) return 0.4;
  if (isObjectOrVenueToponym(value)) return 0.5;
  if (streetLike) return 1;

  const isTargetedLocality = STOCKHOLM_TARGETED_LOCALITIES.some(
    (item) => normalizeText(item) === lower,
  );
  if (isTargetedLocality && lower !== "stockholm") return 2;

  const isStadsdel = STOCKHOLM_STADSDELAR.some(
    (item) => normalizeText(item) === lower || lower.includes(normalizeText(item)),
  );
  if (isStadsdel && lower !== "stockholm" && lower !== "solna") return 2;

  const isKommun = STOCKHOLM_KOMMUNER.some(
    (item) => normalizeText(item) === lower || lower.includes(normalizeText(item)),
  );
  if (isKommun && lower !== "stockholm") return 3;

  // Prefer specific localities like "Nacka Strand" over the municipality "Nacka".
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const startsWithKommun = STOCKHOLM_KOMMUNER.some(
      (item) => normalizeText(item) === words[0],
    );
    if (startsWithKommun) return 2.5;
  }

  if (lower === "stockholm") return 99;
  return 10;
}

export function pickBestToponym(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  
  // Sort by priority and then by length (longer names are often more specific: "Fruängen" > "Ängen")
  return candidates
    .slice()
    .sort((a, b) => {
      const pDiff = toponymPriority(a) - toponymPriority(b);
      if (pDiff !== 0) return pDiff;
      return b.length - a.length;
    })[0];
}

export function extractPrioritizedToponymFromText(text: string): string | null {
  // 0) Absolute priority: Plats: X (highest certainty from official Polisen reports)
  const platsMatch = /\bPlats:\s*([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{1,}(?:\s+[A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{1,}){0,2})/i.exec(text);
  if (platsMatch?.[1]) {
    const value = stripTrailingStopwords(platsMatch[1].trim().replace(/[.,;:!?]+$/, ""));
    if (value.length > 2) return value;
  }

  // 1) First try to find "mot [Destination]" which is very common in SL alerts
  const motMatch = /\bmot\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö\-]{1,}(?:\s+[A-ZÅÄÖa-zåäö][A-Za-zÅÄÖåäö\-]{1,}){0,1})/i.exec(text);
  const motCandidate = motMatch?.[1]?.trim().replace(/[.,;:!?]+$/, "") ?? null;
  if (motCandidate && toponymPriority(motCandidate) < 10) {
    return motCandidate;
  }

  // 2) General extraction across all patterns
  const candidates = extractToponymCandidatesFromText(text);
  const picked = pickBestToponym(candidates);
  
  if (!picked) return null;
  return normalizeText(picked) === "stockholm" ? null : picked;
}

export function extractPrioritizedToponymFromTextPreferSpecific(text: string): string | null {
  let platsFallback: string | null = null;

  const platsMatch =
    /\bPlats:\s*([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ\-]{1,}(?:\s+[A-ZÀ-ÖØ-Þa-zà-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\-]{1,}){0,2})/i.exec(
      text,
    );
  if (platsMatch?.[1]) {
    const value = stripTrailingStopwords(platsMatch[1].trim().replace(/[.,;:!?]+$/, ""));
    if (value.length > 2) {
      if (toponymPriority(value) <= 2.5) return value;
      platsFallback = value;
    }
  }

  const motMatch =
    /\bmot\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ\-]{1,}(?:\s+[A-ZÀ-ÖØ-Þa-zà-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\-]{1,}){0,1})/i.exec(
      text,
    );
  const motCandidate = motMatch?.[1]?.trim().replace(/[.,;:!?]+$/, "") ?? null;
  if (motCandidate && toponymPriority(motCandidate) < 10) return motCandidate;

  const candidates = extractToponymCandidatesFromText(text);
  const picked = pickBestToponym(candidates);
  if (picked) {
    return normalizeText(picked) === "stockholm" ? null : picked;
  }

  if (!platsFallback) return null;
  return normalizeText(platsFallback) === "stockholm" ? null : platsFallback;
}

export function stripTrailingStopwords(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    const last = normalizeText(words[words.length - 1] ?? "");
    if (TOPONYM_TRAILING_STOPWORDS.includes(last)) {
      words.pop();
    } else {
      break;
    }
  }
  return words.join(" ").trim();
}

function normalizeToponymCandidate(value: string): string {
  return stripTrailingStopwords(value.trim().replace(/[.,;:!?]+$/, ""));
}

function isStreetSquareOrStationToponym(value: string): boolean {
  return /(gatan|vagen|vagen|torg|plan|grand|all[eé]|leden|bron|platsen|station(?:en)?|t-centralen|badet|arena|hallen|hall|teatern|teater|sjukhuset|skolan|parken|kyrkan|biblioteket|galleria(?:n)?|forum)\b/i.test(
    normalizeText(value),
  );
}

function isStockholmToponym(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "stockholm" || normalized === "stockholms lan";
}

export function extractStockholmNewsToponymCandidates(text: string): string[] {
  const candidates = new Set<string>();

  const streetCandidate = findStreetToponym(text);
  if (streetCandidate) {
    candidates.add(normalizeToponymCandidate(streetCandidate));
  }

  const stationRegex =
    /\b([A-ZA-Za-zÅÄÖåäö\-]{2,}(?:\s+[A-ZA-Za-zÅÄÖåäö\-]{2,}){0,2}\s(?:station(?:en)?|tunnelbanestation|pendeltagsstation|t-centralen))\b/g;
  let stationMatch = stationRegex.exec(text);
  while (stationMatch) {
    candidates.add(normalizeToponymCandidate(stationMatch[1]));
    stationMatch = stationRegex.exec(text);
  }

  for (const candidate of extractToponymCandidatesFromText(text)) {
    candidates.add(normalizeToponymCandidate(candidate));
  }

  if (/\bstockholm(?:s län)?\b/i.test(text)) {
    candidates.add("Stockholm");
  }

  return Array.from(candidates).filter((item) => item.length > 2);
}

export async function geocodeStockholmNewsToponymFromText(text: string): Promise<{
  query: string;
  coords: { lat: number; lng: number };
  priority: 1 | 2 | 3;
} | null> {
  const candidates = extractStockholmNewsToponymCandidates(text);
  if (candidates.length === 0) return null;

  const prioritized = candidates
    .map((candidate) => {
      const priority: 1 | 2 | 3 = isStreetSquareOrStationToponym(candidate)
        ? 1
        : isStockholmToponym(candidate)
          ? 3
          : 2;
      return { candidate, priority };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.candidate.length - a.candidate.length;
    });

  for (const item of prioritized) {
    const geocoded = await geocodeToponymBestEffort(item.candidate);
    if (!geocoded.coords) continue;

    return {
      query: geocoded.query,
      coords: geocoded.coords,
      priority: item.priority,
    };
  }

  return null;
}

/**
 * Attemps to geocode a toponym by trying progressively shorter chunks of the string.
 */
export async function geocodeToponymBestEffort(toponym: string): Promise<{
  query: string;
  coords: { lat: number; lng: number } | null;
}> {
  const cleaned = stripTrailingStopwords(
    toponym
      .replace(/[–—-]/g, " ")
      .replace(/[.,;:|]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!cleaned) return { query: toponym, coords: null };

  const baseCandidates = new Set<string>();
  baseCandidates.add(cleaned);
  baseCandidates.add(
    cleaned
      .replace(/\bkommun(?:en)?\b/gi, " ")
      .replace(/\bl[aä]n\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  for (const base of Array.from(baseCandidates).filter(Boolean)) {
    const parts = base.split(/\s+/).filter(Boolean);
    for (let len = parts.length; len >= 1; len -= 1) {
      const query = parts.slice(0, len).join(" ");
      const coords = await geocodeLocationName(query);
      if (coords) return { query, coords };

      if (len === 1 && /s$/i.test(query) && query.length > 4) {
        const singular = query.slice(0, -1);
        const coordsSingular = await geocodeLocationName(singular);
        if (coordsSingular) return { query: singular, coords: coordsSingular };
      }
    }
  }

  // One last try without the "Stockholm" suffix just in case it's a separate municipality
  const coordsFinal = await geocodeLocationName(cleaned);
  if (coordsFinal) return { query: cleaned, coords: coordsFinal };

  return { query: cleaned, coords: null };
}
