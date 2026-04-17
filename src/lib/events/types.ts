export type EventCategory =
  | "crime"
  | "traffic"
  | "local_news"
  | "politics"
  | "culture"
  | "sport"
  | "other";

export type EventSourceType = "polisen" | "sl" | "news" | "culture";

export type EventItem = {
  id: string;
  title: string;
  source: string;
  source_url: string;
  source_type?: EventSourceType;
  category: EventCategory;
  location_name: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  geocoding_failed?: boolean;
  summary?: string | null;
  confidence?: number;
  event_start?: string;
  event_end?: string | null;
  venue?: string | null;
  is_future_event?: boolean;
};

export type EventsApiMeta = {
  unavailable_sources: string[];
};

export type EventsApiResponse = {
  events: EventItem[];
  meta: EventsApiMeta;
};
