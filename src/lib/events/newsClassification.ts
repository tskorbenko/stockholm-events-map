import type { EventCategory } from "@/lib/events/types";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

export function classifyNewsCategory(title: string, summary: string | null): EventCategory {
  const text = normalize(`${title} ${summary ?? ""}`);

  // Order matters: pick the most specific signal first.
  if (
    hasAny(text, [
      "skjut",
      "mord",
      "drap",
      "ran",
      "misshandel",
      "inbrott",
      "vald",
      "skadad",
      "hot",
      "polisen",
      "brand",
    ])
  ) {
    // Requirement: only Polisen API data should be in the "crime" category.
    // News items about crimes are categorized as "local_news".
    return "local_news";
  }

  if (
    hasAny(text, [
      "trafik",
      "t-bana",
      "tunnelbana",
      "pendeltag",
      "pendeltåg",
      "buss",
      "sparvagn",
      "spårvagn",
      "stopp i",
      "forsening",
      "försening",
      "avstangd",
      "avstängd",
      "olycka",
      "sl",
    ])
  ) {
    // Requirement: only SL API data should be in the "traffic" category.
    // News items about traffic are categorized as "local_news".
    return "local_news";
  }

  if (
    hasAny(text, [
      "konsert",
      "teater",
      "museum",
      "utstallning",
      "utställning",
      "festival",
      "kultur",
      "premiar",
      "premiär",
    ])
  ) {
    return "culture";
  }

  if (
    hasAny(text, [
      "fotboll",
      "hockey",
      "match",
      "derby",
      "aik",
      "djurgarden",
      "djurgården",
      "hammarby",
      "sport",
    ])
  ) {
    return "sport";
  }

  if (
    hasAny(text, [
      "politik",
      "kommun",
      "region",
      "riksdag",
      "regering",
      "val",
      "moderaterna",
      "socialdemokraterna",
      "miljopartiet",
      "miljöpartiet",
      "liberalerna",
      "sverigedemokraterna",
    ])
  ) {
    return "politics";
  }

  // Default: local news layer (Nyheter)
  return "local_news";
}

