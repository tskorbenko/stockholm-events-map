type Coordinates = { lat: number; lng: number };

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const STOCKHOLM_FALLBACK: Coordinates = { lat: 59.3293, lng: 18.0686 };
const geocodeCache: Record<string, Coordinates | null> = {};
const STOCKHOLM_VIEWBOX = "17.20,60.20,19.30,58.70";
const PRESET_COORDS: Record<string, Coordinates> = {
  // All 26 Municipalities of Stockholm County
  botkyrka: { lat: 59.1955, lng: 17.8335 },
  danderyd: { lat: 59.4005, lng: 18.0398 },
  ekero: { lat: 59.2903, lng: 17.811 },
  "ekerÃ¶": { lat: 59.2903, lng: 17.811 },
  haninge: { lat: 59.1693, lng: 18.1408 },
  huddinge: { lat: 59.2378, lng: 17.981 },
  jarfalla: { lat: 59.4216, lng: 17.8351 },
  "jÃ¤rfÃ¤lla": { lat: 59.4216, lng: 17.8351 },
  lidingo: { lat: 59.3655, lng: 18.1528 },
  "lidingÃ¶": { lat: 59.3655, lng: 18.1528 },
  nacka: { lat: 59.3108, lng: 18.1637 },
  norrtalje: { lat: 59.7579, lng: 18.7049 },
  "norrtÃ¤lje": { lat: 59.7579, lng: 18.7049 },
  nykvarn: { lat: 59.1764, lng: 17.4334 },
  nynashamn: { lat: 58.903, lng: 17.951 },
  "nynÃ¤shamn": { lat: 58.903, lng: 17.951 },
  salem: { lat: 59.201, lng: 17.772 },
  sigtuna: { lat: 59.6234, lng: 17.7214 },
  sollentuna: { lat: 59.4332, lng: 17.9514 },
  solna: { lat: 59.36, lng: 18.0009 },
  stockholm: { lat: 59.3293, lng: 18.0686 },
  sundbyberg: { lat: 59.3621, lng: 17.9628 },
  sodertalje: { lat: 59.1955, lng: 17.6253 },
  "sÃ¶dertÃ¤lje": { lat: 59.1955, lng: 17.6253 },
  tyreso: { lat: 59.242, lng: 18.232 },
  "tyresÃ¶": { lat: 59.242, lng: 18.232 },
  taby: { lat: 59.4439, lng: 18.0687 },
  "tÃ¤by": { lat: 59.4439, lng: 18.0687 },
  "upplands-bro": { lat: 59.514, lng: 17.653 },
  "upplands bro": { lat: 59.514, lng: 17.653 },
  "upplands vasby": { lat: 59.5204, lng: 17.9103 },
  "upplands vÃ¤sby": { lat: 59.5204, lng: 17.9103 },
  vallentuna: { lat: 59.5334, lng: 18.0811 },
  vaxholm: { lat: 59.402, lng: 18.351 },
  varmdo: { lat: 59.332, lng: 18.391 },
  "vÃ¤rmdÃ¶": { lat: 59.332, lng: 18.391 },
  osteraker: { lat: 59.482, lng: 18.301 },
  "Ã¶sterÃ¥ker": { lat: 59.482, lng: 18.301 },

  // Districts and common locations
  akalla: { lat: 59.414, lng: 17.913 },
  alby: { lat: 59.2337, lng: 17.8532 },
  alvik: { lat: 59.333, lng: 17.980 },
  arsta: { lat: 59.3005, lng: 18.0519 },
  "Ã¥rsta": { lat: 59.3005, lng: 18.0519 },
  arstaviken: { lat: 59.3049, lng: 18.0606 },
  "Ã¥rstaviken": { lat: 59.3049, lng: 18.0606 },
  aspudden: { lat: 59.306, lng: 17.998 },
  bagarmossen: { lat: 59.276, lng: 18.131 },
  bandhagen: { lat: 59.270, lng: 18.048 },
  bergshamra: { lat: 59.382, lng: 18.036 },
  blackeberg: { lat: 59.348, lng: 17.882 },
  bredang: { lat: 59.295, lng: 17.933 },
  "bredÃ¤ng": { lat: 59.295, lng: 17.933 },
  bromma: { lat: 59.339, lng: 17.939 },
  enskededalen: { lat: 59.288, lng: 18.101 },
  farsta: { lat: 59.241, lng: 18.091 },
  fittja: { lat: 59.2476, lng: 17.861 },
  flemingsberg: { lat: 59.2207, lng: 17.9482 },
  "flemingsbergs station": { lat: 59.21952, lng: 17.94557 },
  fridhemsplan: { lat: 59.3342, lng: 18.0312 },
  fruangen: { lat: 59.2847, lng: 17.965 },
  "fruÃ¤ngen": { lat: 59.2847, lng: 17.965 },
  "gamla stan": { lat: 59.3257, lng: 18.0717 },
  geneta: { lat: 59.1917, lng: 17.585 },
  granangsringen: { lat: 59.2366, lng: 18.2296 },
  grondal: { lat: 59.316, lng: 18.009 },
  "grÃ¶ndal": { lat: 59.316, lng: 18.009 },
  gullmarsplan: { lat: 59.299, lng: 18.081 },
  hagsatra: { lat: 59.262, lng: 18.012 },
  "hagsÃ¤tra": { lat: 59.262, lng: 18.012 },
  hallonbergen: { lat: 59.375, lng: 17.968 },
  hallunda: { lat: 59.2447, lng: 17.8327 },
  "hallunda centrum": { lat: 59.2439, lng: 17.8333 },
  "huddinge centrum": { lat: 59.2376, lng: 17.9818 },
  hammarbyhojden: { lat: 59.296, lng: 18.098 },
  "hammarbyhÃ¶jden": { lat: 59.296, lng: 18.098 },
  "hammarby sjÃ¶stad": { lat: 59.304, lng: 18.102 },
  handen: { lat: 59.1693, lng: 18.1408 },
  vega: { lat: 59.1689, lng: 18.1349 },
  "vega haninge": { lat: 59.1689, lng: 18.1349 },
  tungelsta: { lat: 59.1009, lng: 18.0469 },
  "tungelsta haninge": { lat: 59.1009, lng: 18.0469 },
  hasselby: { lat: 59.366, lng: 17.842 },
  "hÃ¤sselby": { lat: 59.366, lng: 17.842 },
  "hÃ¤sselby villastad": { lat: 59.378, lng: 17.780 },
  helenelund: { lat: 59.408, lng: 17.962 },
  hogdalen: { lat: 59.263, lng: 18.051 },
  "hÃ¶gdalen": { lat: 59.263, lng: 18.051 },
  hokarangen: { lat: 59.257, lng: 18.083 },
  "hÃ¶karÃ¤ngen": { lat: 59.257, lng: 18.083 },
  husby: { lat: 59.408, lng: 17.925 },
  johanneshov: { lat: 59.297, lng: 18.080 },
  kallhall: { lat: 59.452, lng: 17.811 },
  "kallhÃ¤ll": { lat: 59.452, lng: 17.811 },
  kista: { lat: 59.403, lng: 17.944 },
  kungsholmen: { lat: 59.3323, lng: 18.0315 },
  liljeholmen: { lat: 59.310, lng: 18.022 },
  midsommarkransen: { lat: 59.30154, lng: 18.01015 },
  midsommarkransens: { lat: 59.30154, lng: 18.01015 },
  kransen: { lat: 59.30154, lng: 18.01015 },
  "nacka forum": { lat: 59.3094, lng: 18.1631 },
  "nacka strand": { lat: 59.3158, lng: 18.1669 },
  // Explicit point on Västerlånggatan (Gamla stan), not city-centroid.
  vasterlanggatan: { lat: 59.32392, lng: 18.07033 },
  "västerlånggatan": { lat: 59.32392, lng: 18.07033 },
  boo: { lat: 59.3336, lng: 18.2447 },
  bagarsjobadet: { lat: 59.30981, lng: 18.261712 },
  "bagarsjöbadet": { lat: 59.30981, lng: 18.261712 },
  norrmalm: { lat: 59.3361, lng: 18.0628 },
  ostberga: { lat: 59.288, lng: 18.026 },
  "Ã¶stberga": { lat: 59.288, lng: 18.026 },
  ostermalm: { lat: 59.3391, lng: 18.0837 },
  "Ã¶stermalm": { lat: 59.3391, lng: 18.0837 },
  rindo: { lat: 59.3957, lng: 18.423 },
  "rindÃ¶": { lat: 59.3957, lng: 18.423 },
  rinkeby: { lat: 59.387, lng: 17.928 },
  riksby: { lat: 59.336, lng: 17.935 },
  ropsten: { lat: 59.3574, lng: 18.1021 },
  rudsjoterrassen: { lat: 59.16527749452008, lng: 18.138706004180207 },
  "rudsjÃ¶terrassen": { lat: 59.16527749452008, lng: 18.138706004180207 },
  skarholmen: { lat: 59.2762, lng: 17.9059 },
  "skÃ¤rholmen": { lat: 59.2762, lng: 17.9059 },
  varby: { lat: 59.2668, lng: 17.8845 },
  "vÃ¥rby": { lat: 59.2668, lng: 17.8845 },
  "varby gard": { lat: 59.2658, lng: 17.8832 },
  "vÃ¥rby gÃ¥rd": { lat: 59.2658, lng: 17.8832 },
  "solna strand": { lat: 59.3617, lng: 17.9973 },
  "sodertalje centrum": { lat: 59.1959, lng: 17.6257 },
  dalgatan: { lat: 59.19686, lng: 17.6172 },
  "dalgatan sodertalje": { lat: 59.19686, lng: 17.6172 },
  "dalgatan södertälje": { lat: 59.19686, lng: 17.6172 },
  "dalgatan sa¶derta¤lje": { lat: 59.19686, lng: 17.6172 },
  "dalgatan sa¶dertalje": { lat: 59.19686, lng: 17.6172 },
  "taby centrum": { lat: 59.4432, lng: 18.0698 },
  "jakobsberg centrum": { lat: 59.4232, lng: 17.8331 },
  "skarholmen centrum": { lat: 59.2771, lng: 17.9072 },
  "farsta centrum": { lat: 59.2436, lng: 18.0914 },
  "kista centrum": { lat: 59.4029, lng: 17.9448 },
  skarpnack: { lat: 59.266, lng: 18.131 },
  "skarpnÃ¤ck": { lat: 59.266, lng: 18.131 },
  skondal: { lat: 59.2771, lng: 18.116 },
  "skÃ¶ndal": { lat: 59.2771, lng: 18.116 },
  slussen: { lat: 59.3197, lng: 18.0722 },
  sodermalm: { lat: 59.3105, lng: 18.0718 },
  "sÃ¶dermalm": { lat: 59.3105, lng: 18.0718 },
  spanga: { lat: 59.383, lng: 17.899 },
  "spÃ¥nga": { lat: 59.383, lng: 17.899 },
  stureby: { lat: 59.2868, lng: 18.0503 },
  tensta: { lat: 59.394, lng: 17.901 },
  tumba: { lat: 59.2007, lng: 17.8344 },
  tullinge: { lat: 59.2045, lng: 17.906 },
  ulriksdal: { lat: 59.389, lng: 18.021 },
  vasastan: { lat: 59.3444, lng: 18.0441 },
  vallingby: { lat: 59.363, lng: 17.873 },
  "vÃ¤llingby": { lat: 59.363, lng: 17.873 },
  fornhojden: { lat: 59.196, lng: 17.653 },
  "fornhÃ¶jden": { lat: 59.196, lng: 17.653 },
  hovet: { lat: 59.29345, lng: 18.08385 },
  "hovet stockholm": { lat: 59.29345, lng: 18.08385 },
  "hovet, stockholm": { lat: 59.29345, lng: 18.08385 },
  "avicii arena": { lat: 59.29362, lng: 18.08317 },
  "avicii arena stockholm": { lat: 59.29362, lng: 18.08317 },
  "avicii arena, stockholm": { lat: 59.29362, lng: 18.08317 },
};

export function getStockholmFallbackCoordinates(): Coordinates {
  return STOCKHOLM_FALLBACK;
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function geocodeLocationName(
  locationName: string,
): Promise<Coordinates | null> {
  const normalized = normalizeKey(locationName);
  if (!normalized) return null;

  if (PRESET_COORDS[normalized]) return PRESET_COORDS[normalized];
  if (normalized in geocodeCache) return geocodeCache[normalized];

  const query = encodeURIComponent(`${locationName}, Stockholm, Sweden`);
  const url = `${NOMINATIM_URL}?format=jsonv2&limit=1&countrycodes=se&bounded=1&viewbox=${STOCKHOLM_VIEWBOX}&q=${query}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "stockholm-city-awareness-mvp/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  const first = data[0];
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    geocodeCache[normalized] = null;
    return null;
  }

  const coords = { lat, lng };
  geocodeCache[normalized] = coords;
  return coords;
}
