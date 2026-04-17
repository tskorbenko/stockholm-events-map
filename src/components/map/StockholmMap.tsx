"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EventList } from "@/components/events/EventList";
import { MapControlsPanel } from "@/components/map/MapControlsPanel";
import type { EventCategory, EventItem, EventsApiResponse } from "@/lib/events/types";
import { filterEventsByTime, type TimeFilterKey } from "@/lib/events/timeFilter";
import { CATEGORY_ORDER, getCategoryVisual } from "@/lib/events/categories";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

type StockholmMapProps = {
  onLoadingStateChange?: (state: { isLoading: boolean; progress: number }) => void;
};

type ClusterCategoryKey = "crime" | "traffic" | "news" | "culture";
type MarkerClusterFactory = (options: Record<string, unknown>) => import("leaflet").LayerGroup;
type PersistedMapPreferences = {
  activeFilters?: EventCategory[];
  activeTimeFilter?: TimeFilterKey;
  mapView?: { center: [number, number]; zoom: number };
};
const TOUCH_UI_MAX_WIDTH = 1024;

const TIME_FILTER_OPTIONS: Array<{ key: TimeFilterKey; label: string }> = [
  { key: "1h", label: "Senaste timmen" },
  { key: "today", label: "Idag" },
  { key: "24h", label: "Senaste 24 timmarna" },
  { key: "7d", label: "Senaste veckan" },
];
const MOBILE_TIME_FILTER_OPTIONS: Array<{ key: TimeFilterKey; label: string }> = [
  { key: "1h", label: "Sen. timmen" },
  { key: "today", label: "Idag" },
  { key: "24h", label: "Sen. 24h" },
  { key: "7d", label: "Sen. veckan" },
];

const CLUSTER_COLORS: Record<ClusterCategoryKey, string> = {
  crime: "#dc2626",
  traffic: "#2563eb",
  news: "#22c55e",
  culture: "#7c3aed",
};

const CLUSTER_ICON_OFFSET: Record<ClusterCategoryKey, { x: number; y: number }> = {
  crime: { x: -18, y: -18 },
  traffic: { x: 18, y: -18 },
  news: { x: -18, y: 18 },
  culture: { x: 18, y: 18 },
};

const UI_CATEGORY_ORDER: EventCategory[] = CATEGORY_ORDER.filter(
  (category) => category !== "sport" && category !== "other",
);
const MAP_PREFERENCES_STORAGE_KEY = "stockholm-map-preferences-v1";

function markerHtml({
  size,
  color,
  selected,
  isNews,
  isTouchUi,
}: {
  size: number;
  color: string;
  selected: boolean;
  isNews: boolean;
  isTouchUi: boolean;
}): string {
  const isNewsDiamond = isNews && !selected && !isTouchUi;
  const radius = isNewsDiamond ? 6 : 9999;
  const rotate = isNewsDiamond ? "transform:rotate(45deg);" : "";
  const extra = isNewsDiamond ? "box-sizing:border-box;" : "";
  const shadow = selected
    ? "0 0 0 4px rgba(255,255,255,0.9),0 4px 10px rgba(0,0,0,0.35)"
    : "0 1px 4px rgba(0,0,0,0.35)";

  return `<span style="display:block;width:${size}px;height:${size}px;border-radius:${radius}px;border:2px solid #ffffff;background:${color};${rotate}${extra}box-shadow:${shadow};"></span>`;
}

function shortenSummary(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeTitlePrefixFromSummary(title: string, summary: string): string | null {
  const titleCore = title.replace(/\s+/g, " ").replace(/[.,:;!?]+$/g, "").trim();
  const summaryCore = summary.replace(/\s+/g, " ").trim();
  if (!summaryCore) return null;
  if (!titleCore) return summaryCore;

  const titlePattern = escapeRegExp(titleCore).replace(/\s+/g, "\\s+");
  const leadPattern = new RegExp(`^\\s*${titlePattern}\\s*[|.,:;!?\\-–—]*\\s*`, "i");
  const withoutLead = summaryCore
    .replace(leadPattern, "")
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!withoutLead) return null;
  return withoutLead;
}

function normalizeLooseText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoilerplateSummaryText(text: string): boolean {
  const value = normalizeLooseText(text);
  return (
    value.includes("kakor") ||
    value.includes("cookie") ||
    value.includes("polisen.se kakor") ||
    value.includes("anpassa installningar for kakor") ||
    value.includes("nodvandiga kakor") ||
    value.includes("webbanalys") ||
    value.includes("integritetspolicy") ||
    value.includes("window._paq")
  );
}

function cleanSummaryForCard(summary: string): string | null {
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !isBoilerplateSummaryText(part));

  const cleaned = sentences.join(" ").trim();
  if (!cleaned || isBoilerplateSummaryText(cleaned)) return null;
  return cleaned;
}

function shouldHideMarkerForCoarseLocation(event: EventItem): boolean {
  // Hide coarse "Stockholm" points only for incident/news flows.
  // Culture events often intentionally use city-level location labels.
  if (event.source_type === "culture") return false;

  const raw = (event.location_name || "").trim();
  if (!raw) return false;
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized === "stockholm" ||
    normalized === "stockholms lan" ||
    normalized === "stockholm kommun"
  );
}

function isCoarseStockholmLabel(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized === "stockholm" ||
    normalized === "stockholms lan" ||
    normalized === "stockholm kommun"
  );
}

function stripDefaultStockholmSuffix(value: string): string {
  return value
    .replace(/,\s*Stockholm$/i, "")
    .replace(/,\s*Stockholms\s*l[aä]n$/i, "")
    .trim();
}

function toClusterCategory(event: EventItem): ClusterCategoryKey {
  if (event.source_type === "polisen") return "crime";
  if (event.source_type === "sl") return "traffic";
  if (event.source_type === "culture") return "culture";
  return "news";
}

function buildSpiralOffsets(stepPx: number, rings: number): Array<{ x: number; y: number }> {
  const offsets: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = ring * stepPx;
    const pointsInRing = Math.max(8, ring * 8);
    for (let i = 0; i < pointsInRing; i += 1) {
      const angle = (i / pointsInRing) * Math.PI * 2;
      offsets.push({
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      });
    }
  }
  return offsets;
}

export function StockholmMap({ onLoadingStateChange }: StockholmMapProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<EventCategory[]>(UI_CATEGORY_ORDER);
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilterKey>("24h");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTilesLoading, setIsTilesLoading] = useState(true);
  const [tileTotal, setTileTotal] = useState(0);
  const [tileDone, setTileDone] = useState(0);
  const [initialTileLoadDone, setInitialTileLoadDone] = useState(false);
  const [initialMarkersReady, setInitialMarkersReady] = useState(false);
  const [unavailableSources, setUnavailableSources] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [mobileListHeight, setMobileListHeight] = useState(280);
  const [isMobileListDragging, setIsMobileListDragging] = useState(false);
  const [desktopListOpen, setDesktopListOpen] = useState(false);
  const [desktopListVisible, setDesktopListVisible] = useState(false);
  const [desktopListFadedIn, setDesktopListFadedIn] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [activeEventPanel, setActiveEventPanel] = useState<EventItem | null>(null);
  const [activeEventPanelVisible, setActiveEventPanelVisible] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerByIdRef = useRef<Record<string, LeafletMarker>>({});
  const markerEventByIdRef = useRef<Record<string, EventItem>>({});
  const markerPixelOffsetByIdRef = useRef<Record<string, { x: number; y: number }>>({});
  const clusterLayersRef = useRef<Record<ClusterCategoryKey, import("leaflet").LayerGroup | null>>({
    crime: null,
    traffic: null,
    news: null,
    culture: null,
  });
  const initialTileLoadDoneRef = useRef(false);
  const mobileListDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const mobileListDragPointerIdRef = useRef<number | null>(null);
  const desktopListFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventCardFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopListFadeInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventCardFadeInTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserMapInteractionRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const initialMapViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const activeFiltersRef = useRef<EventCategory[]>(UI_CATEGORY_ORDER);
  const activeTimeFilterRef = useRef<TimeFilterKey>("24h");
  const isTouchUiRef = useRef(false);
  const [isTouchUi, setIsTouchUi] = useState(false);

  useEffect(() => {
    const updateTouchUi = () => {
      const next = window.matchMedia(`(max-width: ${TOUCH_UI_MAX_WIDTH}px)`).matches;
      isTouchUiRef.current = next;
      setIsTouchUi(next);
    };
    updateTouchUi();
    window.addEventListener("resize", updateTouchUi);
    return () => {
      window.removeEventListener("resize", updateTouchUi);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MAP_PREFERENCES_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PersistedMapPreferences;
      const savedFilters = Array.isArray(parsed.activeFilters)
        ? parsed.activeFilters.filter((value): value is EventCategory => UI_CATEGORY_ORDER.includes(value as EventCategory))
        : [];
      if (savedFilters.length > 0) {
        setActiveFilters(savedFilters);
      }

      if (
        parsed.activeTimeFilter &&
        TIME_FILTER_OPTIONS.some((option) => option.key === parsed.activeTimeFilter)
      ) {
        setActiveTimeFilter(parsed.activeTimeFilter);
      }

      const mapView = parsed.mapView;
      if (
        mapView &&
        Array.isArray(mapView.center) &&
        mapView.center.length === 2 &&
        Number.isFinite(mapView.center[0]) &&
        Number.isFinite(mapView.center[1]) &&
        Number.isFinite(mapView.zoom)
      ) {
        initialMapViewRef.current = {
          center: [Number(mapView.center[0]), Number(mapView.center[1])],
          zoom: Number(mapView.zoom),
        };
        hasUserMapInteractionRef.current = true;
      }
    } catch {
      // ignore corrupted browser storage
    }
  }, []);

  useEffect(() => {
    try {
      const map = mapRef.current;
      const existingRaw = window.localStorage.getItem(MAP_PREFERENCES_STORAGE_KEY);
      const existing = existingRaw ? (JSON.parse(existingRaw) as PersistedMapPreferences) : {};
      const mapView =
        map && Number.isFinite(map.getZoom())
          ? {
              center: [map.getCenter().lat, map.getCenter().lng] as [number, number],
              zoom: map.getZoom(),
            }
          : existing.mapView;

      const nextPayload: PersistedMapPreferences = {
        activeFilters,
        activeTimeFilter,
        mapView,
      };
      window.localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPayload));
    } catch {
      // ignore browser storage errors
    }
  }, [activeFilters, activeTimeFilter]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

  useEffect(() => {
    activeTimeFilterRef.current = activeTimeFilter;
  }, [activeTimeFilter]);

  const applyMarkerDeclutter = useCallback(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const markerEntries = Object.entries(markerByIdRef.current)
      .map(([eventId, marker]) => ({
        eventId,
        marker,
        event: markerEventByIdRef.current[eventId],
      }))
      .filter((entry): entry is { eventId: string; marker: LeafletMarker; event: EventItem } => Boolean(entry.event))
      .filter((entry) => map.hasLayer(entry.marker));

    const candidateOffsets = buildSpiralOffsets(9, 6);
    const minDistancePx = 14;
    const placed: Array<{ x: number; y: number }> = [];
    const nextOffsets: Record<string, { x: number; y: number }> = {};

    markerEntries
      .sort((a, b) => {
        const timeDiff = new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.event.id.localeCompare(b.event.id);
      })
      .forEach(({ eventId, marker }) => {
        const basePoint = map.latLngToLayerPoint(marker.getLatLng());
        let chosenOffset = candidateOffsets[0];
        for (const offset of candidateOffsets) {
          const candidateX = basePoint.x + offset.x;
          const candidateY = basePoint.y + offset.y;
          const collides = placed.some((point) => {
            const dx = point.x - candidateX;
            const dy = point.y - candidateY;
            return Math.hypot(dx, dy) < minDistancePx;
          });
          if (!collides) {
            chosenOffset = offset;
            break;
          }
        }

        placed.push({
          x: basePoint.x + chosenOffset.x,
          y: basePoint.y + chosenOffset.y,
        });
        nextOffsets[eventId] = chosenOffset;
      });

    markerPixelOffsetByIdRef.current = nextOffsets;

    for (const { eventId, marker, event } of markerEntries) {
      const selected = event.id === activeIdRef.current;
      const normalizedLocationName = (event.location_name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const isStreetLevelToponym =
        /(gatan|vagen|grand|torg|plan|alle|allen|leden|bron|platsen)\b/i.test(normalizedLocationName);
      const offset = selected || isStreetLevelToponym ? { x: 0, y: 0 } : nextOffsets[eventId] ?? { x: 0, y: 0 };
      const touchMode = isTouchUiRef.current;
      const size = selected ? (touchMode ? 27 : 18) : touchMode ? 21 : 14;
      const visual = getCategoryVisual(event.category);
      const isNews = event.source_type === "news";
      marker.setIcon(
        L.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2 - offset.x, size / 2 - offset.y],
          html: markerHtml({ size, color: visual.markerColor, selected, isNews, isTouchUi: touchMode }),
        }),
      );
      marker.setZIndexOffset(selected ? 1000 : 0);
    }
  }, []);

  const visibleEvents = useMemo(() => {
    const byCategory = events.filter((event) => activeFilters.includes(event.category));
    return filterEventsByTime(byCategory, activeTimeFilter);
  }, [events, activeFilters, activeTimeFilter]);

  const activeEvent = useMemo(
    () => visibleEvents.find((event) => event.id === activeId) ?? null,
    [activeId, visibleEvents],
  );

  useEffect(() => {
    if (desktopListFadeTimeoutRef.current) {
      clearTimeout(desktopListFadeTimeoutRef.current);
      desktopListFadeTimeoutRef.current = null;
    }
    if (desktopListFadeInTimeoutRef.current) {
      clearTimeout(desktopListFadeInTimeoutRef.current);
      desktopListFadeInTimeoutRef.current = null;
    }

    if (desktopListOpen) {
      setDesktopListVisible(true);
      setDesktopListFadedIn(false);
      desktopListFadeInTimeoutRef.current = setTimeout(() => {
        setDesktopListFadedIn(true);
        desktopListFadeInTimeoutRef.current = null;
      }, 20);
      return;
    }

    setDesktopListFadedIn(false);
    desktopListFadeTimeoutRef.current = setTimeout(() => {
      setDesktopListVisible(false);
      desktopListFadeTimeoutRef.current = null;
    }, 180);
  }, [desktopListOpen]);

  useEffect(() => {
    if (eventCardFadeTimeoutRef.current) {
      clearTimeout(eventCardFadeTimeoutRef.current);
      eventCardFadeTimeoutRef.current = null;
    }
    if (eventCardFadeInTimeoutRef.current) {
      clearTimeout(eventCardFadeInTimeoutRef.current);
      eventCardFadeInTimeoutRef.current = null;
    }

    if (activeEvent) {
      setActiveEventPanel(activeEvent);
      setActiveEventPanelVisible(false);
      eventCardFadeInTimeoutRef.current = setTimeout(() => {
        setActiveEventPanelVisible(true);
        eventCardFadeInTimeoutRef.current = null;
      }, 20);
      return;
    }

    if (activeEventPanel) {
      setActiveEventPanelVisible(false);
      eventCardFadeTimeoutRef.current = setTimeout(() => {
        setActiveEventPanel(null);
        eventCardFadeTimeoutRef.current = null;
      }, 180);
    }
  }, [activeEvent, activeEventPanel]);

  useEffect(() => {
    return () => {
      if (desktopListFadeTimeoutRef.current) clearTimeout(desktopListFadeTimeoutRef.current);
      if (eventCardFadeTimeoutRef.current) clearTimeout(eventCardFadeTimeoutRef.current);
      if (desktopListFadeInTimeoutRef.current) clearTimeout(desktopListFadeInTimeoutRef.current);
      if (eventCardFadeInTimeoutRef.current) clearTimeout(eventCardFadeInTimeoutRef.current);
    };
  }, []);

  const displayActiveEvent = activeEventPanel;

  const activeEventLocationLabel = useMemo(() => {
    if (!displayActiveEvent) return "Uppgift saknas";
    if (displayActiveEvent.source_type === "culture") {
      const venue = (displayActiveEvent.venue || "").trim();
      const location = (displayActiveEvent.location_name || "").trim();

      if (venue && location) {
        const venueLoose = venue
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const locationLoose = location
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (locationLoose.includes(venueLoose)) return stripDefaultStockholmSuffix(location) || location;
        if (!isCoarseStockholmLabel(location)) {
          return stripDefaultStockholmSuffix(`${venue}, ${location}`) || `${venue}, ${location}`;
        }
      }

      if (venue) return stripDefaultStockholmSuffix(venue) || venue;
      if (location) return stripDefaultStockholmSuffix(location) || location;
    }
    return displayActiveEvent.location_name || displayActiveEvent.venue || "Uppgift saknas";
  }, [displayActiveEvent]);

  const activeEventSummary = useMemo(() => {
    if (!displayActiveEvent?.summary) return null;
    const withoutTitle = removeTitlePrefixFromSummary(displayActiveEvent.title, displayActiveEvent.summary);
    if (!withoutTitle) return null;
    const cleanedSummary = cleanSummaryForCard(withoutTitle);
    if (!cleanedSummary) return null;
    if (displayActiveEvent.source_type === "news") {
      return shortenSummary(cleanedSummary, 220);
    }
    return cleanedSummary;
  }, [displayActiveEvent]);

  const activeEventVisual = displayActiveEvent ? getCategoryVisual(displayActiveEvent.category) : null;

  const geocodingFailedVisibleCount = useMemo(
    () => visibleEvents.filter((event) => event.geocoding_failed || event.lat === null || event.lng === null).length,
    [visibleEvents],
  );

  const tileProgress = useMemo(() => {
    if (initialTileLoadDone) return 1;
    if (!mapReady) return 0;
    if (tileTotal <= 0) return isTilesLoading ? 0.1 : 1;
    return Math.min(tileDone / tileTotal, isTilesLoading ? 0.95 : 1);
  }, [initialTileLoadDone, isTilesLoading, mapReady, tileDone, tileTotal]);

  const loadingProgress = useMemo(() => {
    const mapPart = mapReady ? 0.25 : 0;
    const dataPart = !isLoading ? 0.35 : 0;
    const markersPart = initialMarkersReady ? 0.15 : 0;
    const tilesPart = 0.25 * tileProgress;
    return Math.round((mapPart + dataPart + markersPart + tilesPart) * 100);
  }, [initialMarkersReady, isLoading, mapReady, tileProgress]);

  const isMapBusy = loadingProgress < 100 || isRefreshing;

  useEffect(() => {
    onLoadingStateChange?.({ isLoading: isMapBusy, progress: loadingProgress });
  }, [isMapBusy, loadingProgress, onLoadingStateChange]);

  const toggleFilter = (category: EventCategory) => {
    setActiveId(null);
    setActiveFilters((prev) => {
      if (prev.includes(category)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== category);
      }
      return [...prev, category];
    });
  };

  const selectEvent = useCallback((eventId: string) => {
    setActiveId((prev) => (prev === eventId ? null : eventId));
  }, []);

  const clearSelection = useCallback(() => setActiveId(null), []);

  const resetFilters = useCallback(() => {
    clearSelection();
    setActiveFilters(UI_CATEGORY_ORDER);
    setActiveTimeFilter("24h");
  }, [clearSelection]);

  const selectTimeFilter = useCallback(
    (key: TimeFilterKey) => {
      clearSelection();
      setActiveTimeFilter(key);
    },
    [clearSelection],
  );

  const toggleMobileList = useCallback(() => {
    setMobileListOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = mobileListDragRef.current;
      if (!drag) return;
      if (
        mobileListDragPointerIdRef.current !== null &&
        event.pointerId !== mobileListDragPointerIdRef.current
      ) {
        return;
      }
      event.preventDefault();
      const delta = event.clientY - drag.startY;
      const maxHeight = Math.floor(window.innerHeight * 0.85);
      const nextHeight = Math.max(180, Math.min(maxHeight, drag.startHeight + delta));
      setMobileListHeight(nextHeight);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (
        mobileListDragPointerIdRef.current !== null &&
        event.pointerId !== mobileListDragPointerIdRef.current
      ) {
        return;
      }
      mobileListDragRef.current = null;
      mobileListDragPointerIdRef.current = null;
      setIsMobileListDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadEvents(isBackgroundRefresh = false) {
      try {
        if (mounted && isBackgroundRefresh) setIsRefreshing(true);
        const response = await fetch("/api/events", { cache: "no-store" });
        if (!response.ok) {
          if (mounted) {
            setEvents((prev) => prev);
            setUnavailableSources(["Polisen", "SL"]);
          }
          return;
        }
        const data = (await response.json()) as EventsApiResponse | EventItem[];
        if (!mounted) return;

        if (Array.isArray(data)) {
          setEvents((prev) => (data.length === 0 && prev.length > 0 ? prev : data));
          setUnavailableSources([]);
          if (data.length > 0) {
            setLastUpdatedAt(new Date().toISOString());
          }
          return;
        }

        const incomingEvents = Array.isArray(data.events) ? data.events : [];
        setEvents((prev) => (incomingEvents.length === 0 && prev.length > 0 ? prev : incomingEvents));
        setUnavailableSources(data.meta?.unavailable_sources ?? []);
        if (incomingEvents.length > 0) {
          setLastUpdatedAt(new Date().toISOString());
        }
      } catch {
        if (mounted) {
          setEvents((prev) => prev);
          setUnavailableSources(["Polisen", "SL"]);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void loadEvents();
    const refreshInterval = setInterval(() => {
      void loadEvents(true);
    }, 90_000);

    return () => {
      mounted = false;
      clearInterval(refreshInterval);
    };
  }, []);

  useEffect(() => {
    initialTileLoadDoneRef.current = initialTileLoadDone;
  }, [initialTileLoadDone]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let mounted = true;

    void (async () => {
      const leafletModule = await import("leaflet");
      const L = ((leafletModule as unknown as { default?: typeof import("leaflet") }).default ??
        leafletModule) as typeof import("leaflet");
      // markercluster augments a mutable global Leaflet object.
      (window as unknown as { L?: typeof import("leaflet") }).L = L;
      await import("leaflet.markercluster");
      if (!mounted || !mapContainerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const initialView = initialMapViewRef.current;
      const map = L.map(mapContainerRef.current, {
        center: initialView?.center ?? [59.3293, 18.0686],
        zoom: initialView?.zoom ?? 11,
        scrollWheelZoom: true,
      });

      const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      });

      tileLayer.on("loading", () => {
        if (initialTileLoadDoneRef.current) return;
        setIsTilesLoading(true);
        setTileTotal(0);
        setTileDone(0);
      });
      tileLayer.on("tileloadstart", () => {
        if (initialTileLoadDoneRef.current) return;
        setTileTotal((prev) => prev + 1);
      });
      tileLayer.on("tileload", () => {
        if (initialTileLoadDoneRef.current) return;
        setTileDone((prev) => prev + 1);
      });
      tileLayer.on("tileerror", () => {
        if (initialTileLoadDoneRef.current) return;
        setTileDone((prev) => prev + 1);
      });
      tileLayer.on("load", () => {
        setIsTilesLoading(false);
        setInitialTileLoadDone(true);
      });
      tileLayer.addTo(map);

      map.on("zoomstart", () => {
        hasUserMapInteractionRef.current = true;
      });
      map.on("dragstart", () => {
        hasUserMapInteractionRef.current = true;
      });

      const markerClusterGroup = (L as unknown as { markerClusterGroup?: MarkerClusterFactory })
        .markerClusterGroup;
      if (!markerClusterGroup) {
        console.error("[map] markercluster plugin failed to initialize");
        return;
      }

      const createClusterLayer = (category: ClusterCategoryKey) =>
        markerClusterGroup({
          maxClusterRadius: 50,
          disableClusteringAtZoom: 14,
          showCoverageOnHover: false,
          removeOutsideVisibleBounds: true,
          chunkedLoading: true,
          iconCreateFunction(cluster: { getChildCount: () => number }) {
            const count = cluster.getChildCount();
            const color = CLUSTER_COLORS[category];
            const size = 28;
            const paddingX = 7;
            const fontSize = 10;
            const offset = CLUSTER_ICON_OFFSET[category];
            return L.divIcon({
              className: "map-category-cluster",
              html: `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:${size}px;height:${size}px;padding:0 ${paddingX}px;border-radius:999px;border:2px solid #ffffff;background:${color};color:#ffffff;font-weight:600;font-size:${fontSize}px;box-shadow:0 1px 4px rgba(0,0,0,0.18);">${count}</span>`,
              iconSize: [size, size],
              iconAnchor: [size / 2 - offset.x, size / 2 - offset.y],
            });
          },
        });

      const crimeLayer = createClusterLayer("crime");
      const trafficLayer = createClusterLayer("traffic");
      const newsLayer = createClusterLayer("news");
      const cultureLayer = createClusterLayer("culture");

      crimeLayer.addTo(map);
      trafficLayer.addTo(map);
      newsLayer.addTo(map);
      cultureLayer.addTo(map);

      clusterLayersRef.current = {
        crime: crimeLayer,
        traffic: trafficLayer,
        news: newsLayer,
        culture: cultureLayer,
      };

      map.on("click", clearSelection);
      map.on("zoomend moveend", applyMarkerDeclutter);
      map.on("zoomend moveend", () => {
        try {
          const existingRaw = window.localStorage.getItem(MAP_PREFERENCES_STORAGE_KEY);
          const existing = existingRaw ? (JSON.parse(existingRaw) as PersistedMapPreferences) : {};
          const nextPayload: PersistedMapPreferences = {
            ...existing,
            activeFilters: activeFiltersRef.current,
            activeTimeFilter: activeTimeFilterRef.current,
            mapView: {
              center: [map.getCenter().lat, map.getCenter().lng],
              zoom: map.getZoom(),
            },
          };
          window.localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPayload));
        } catch {
          // ignore browser storage errors
        }
      });

      mapRef.current = map;
      setMapReady(true);
    })();

    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerByIdRef.current = {};
      markerEventByIdRef.current = {};
      markerPixelOffsetByIdRef.current = {};
      clusterLayersRef.current = { crime: null, traffic: null, news: null, culture: null };
      leafletRef.current = null;
      setMapReady(false);
      setIsTilesLoading(true);
      setTileTotal(0);
      setTileDone(0);
      setInitialMarkersReady(false);
      hasUserMapInteractionRef.current = false;
    };
  }, [applyMarkerDeclutter, clearSelection]);

  useEffect(() => {
    if (!leafletRef.current) return;
    const clusterLayers = clusterLayersRef.current;
    if (!clusterLayers.crime || !clusterLayers.traffic || !clusterLayers.news || !clusterLayers.culture) return;
    const L = leafletRef.current;

    clusterLayers.crime.clearLayers();
    clusterLayers.traffic.clearLayers();
    clusterLayers.news.clearLayers();
    clusterLayers.culture.clearLayers();
    markerByIdRef.current = {};
    markerEventByIdRef.current = {};
    markerPixelOffsetByIdRef.current = {};

    const latLngs: Array<[number, number]> = [];

    for (const event of visibleEvents) {
      if (event.lat === null || event.lng === null) continue;
      if (shouldHideMarkerForCoarseLocation(event)) continue;
      latLngs.push([event.lat, event.lng]);

      const size = isTouchUi ? 21 : 14;
      const visual = getCategoryVisual(event.category);
      const isNews = event.source_type === "news";
      const marker = L.marker([event.lat, event.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: markerHtml({ size, color: visual.markerColor, selected: false, isNews, isTouchUi }),
        }),
      });

      marker.on("click", (e: { originalEvent?: { stopPropagation?: () => void } }) => {
        e.originalEvent?.stopPropagation?.();
        selectEvent(event.id);
      });

      const clusterCategory = toClusterCategory(event);
      const targetCluster = clusterLayers[clusterCategory];
      if (!targetCluster) continue;
      targetCluster.addLayer(marker);
      markerByIdRef.current[event.id] = marker;
      markerEventByIdRef.current[event.id] = event;
    }

    if (latLngs.length > 0 && mapRef.current && !hasUserMapInteractionRef.current) {
      const bounds = L.latLngBounds(latLngs);
      mapRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    }

    applyMarkerDeclutter();

    if (!isLoading && mapReady) {
      setInitialMarkersReady(true);
    }
  }, [applyMarkerDeclutter, isLoading, isTouchUi, mapReady, visibleEvents, selectEvent]);

  useEffect(() => {
    applyMarkerDeclutter();
  }, [activeId, applyMarkerDeclutter, visibleEvents]);

  useEffect(() => {
    if (!activeEvent || !mapRef.current || activeEvent.lat === null || activeEvent.lng === null) return;
    mapRef.current.flyTo([activeEvent.lat, activeEvent.lng], Math.max(mapRef.current.getZoom(), 12), {
      animate: true,
      duration: 0.5,
    });
  }, [activeEvent]);

  return (
    <section
      aria-label="Karta over Stockholm"
      className="relative h-full min-h-0 flex-1 overflow-hidden bg-zinc-100"
    >
      <div ref={mapContainerRef} className="absolute inset-0" />

      <div className="absolute inset-x-0 top-0 z-[1000] border border-zinc-200/70 border-l-0 border-r-0 bg-white/97 px-2 pb-0 pt-2 shadow-sm backdrop-blur md:hidden">
          <MapControlsPanel
            title="Kategorier"
            isListOpen={mobileListOpen}
            onToggleList={toggleMobileList}
            onReset={resetFilters}
            categories={UI_CATEGORY_ORDER}
            activeFilters={activeFilters}
            onToggleCategory={toggleFilter}
            timeOptions={MOBILE_TIME_FILTER_OPTIONS}
            activeTimeFilter={activeTimeFilter}
            onSelectTimeFilter={selectTimeFilter}
            isMobileCompact
        />

        <div
          className={`mt-1 overflow-hidden ${
            isMobileListDragging ? "transition-none" : "transition-all duration-300 ease-out"
          } ${
            mobileListOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          } ${mobileListOpen ? "" : "pointer-events-none"}`}
          style={{ maxHeight: mobileListOpen ? `${mobileListHeight + 10}px` : "0px" }}
        >
          <div className="relative mt-0 overflow-visible">
            <div
              className="overflow-hidden border border-zinc-200/80 bg-white/80 shadow-lg backdrop-blur"
              style={{ height: `${mobileListHeight}px` }}
            >
              <EventList
                events={visibleEvents}
                selectedId={activeId}
                onSelect={(eventId) => {
                  selectEvent(eventId);
                }}
                className="h-full [&>div:last-child]:overflow-y-scroll [&>div:last-child]:[scrollbar-gutter:stable]"
              />
            </div>
            <div className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-center">
              <button
                type="button"
                aria-label="Drag to resize list"
                className="pointer-events-auto flex h-6 w-full touch-none cursor-ns-resize select-none items-center justify-center border-0 bg-transparent p-0 leading-none"
                onPointerDown={(event) => {
                  event.preventDefault();
                  mobileListDragPointerIdRef.current = event.pointerId;
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  mobileListDragRef.current = {
                    startY: event.clientY,
                    startHeight: mobileListHeight,
                  };
                  setIsMobileListDragging(true);
                }}
              >
                <span className="mx-auto block h-1 w-10 rounded-full bg-zinc-500/90" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-y-3 left-3 z-[1000] hidden md:flex">
        {desktopListVisible ? (
          <EventList
            events={visibleEvents}
            selectedId={activeId}
            onSelect={(eventId) => {
              selectEvent(eventId);
            }}
            className={`h-full max-h-[calc(100vh-8.5rem)] w-[340px] overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/80 shadow-md backdrop-blur transition-opacity duration-200 ${
              desktopListFadedIn ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
        ) : null}
      </div>

      <div className="absolute right-3 top-3 z-[1000] hidden md:block">
        <div className="w-[280px] rounded-2xl border border-zinc-200/80 bg-white/80 p-3 shadow-sm backdrop-blur">
          <MapControlsPanel
            title="Kategorier"
            isListOpen={desktopListOpen}
            onToggleList={() => setDesktopListOpen((prev) => !prev)}
            onReset={resetFilters}
            categories={UI_CATEGORY_ORDER}
            activeFilters={activeFilters}
            onToggleCategory={toggleFilter}
            timeOptions={TIME_FILTER_OPTIONS}
            activeTimeFilter={activeTimeFilter}
            onSelectTimeFilter={selectTimeFilter}
          />
        </div>
      </div>

      {displayActiveEvent ? (
        <aside
          className={`absolute bottom-0 left-0 right-0 z-[1000] border border-zinc-200 bg-white/80 p-4 shadow-lg backdrop-blur transition-opacity duration-200 md:bottom-4 md:left-auto md:right-4 md:w-[360px] md:rounded-2xl ${
            activeEventPanelVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="mb-1 flex items-start justify-between">
            {activeEventVisual ? (
              <p
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] uppercase tracking-wide ${activeEventVisual.badgeClassName}`}
              >
                <span aria-hidden>{activeEventVisual.icon}</span>
                <span>{activeEventVisual.label}</span>
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              <span aria-hidden>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </span>
              Stäng
            </button>
          </div>
          <p className="text-sm font-semibold text-zinc-900">{displayActiveEvent.title}</p>
          <p className="mt-1 text-sm text-zinc-700">Plats: {activeEventLocationLabel}</p>
          {activeEventSummary ? (
            <p className="mt-2 line-clamp-4 text-sm text-zinc-700">{activeEventSummary}</p>
          ) : null}
          <p className="mt-1 text-sm text-zinc-700">Kalla: {displayActiveEvent.source || "Uppgift saknas"}</p>
          {displayActiveEvent.source_url ? (
            <a
              href={displayActiveEvent.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm text-blue-700 underline underline-offset-2"
            >
              Öppna originalkällan
            </a>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">Lank till kalla saknas for denna handelse.</p>
          )}
          <p className="text-sm text-zinc-700">
            Tid:{" "}
            {new Date(displayActiveEvent.created_at).toLocaleString("sv-SE", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Stockholm",
            })}
          </p>
          {displayActiveEvent.lat === null || displayActiveEvent.lng === null ? (
            <p className="mt-1 text-xs text-zinc-500">
              Exakt position saknas just nu. Handelsen visas i listan och uppdateras nar position hittas.
            </p>
          ) : null}
        </aside>
      ) : null}

      {!activeEvent && isLoading ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs text-zinc-600 shadow-sm">
          Laddar handelser...
        </div>
      ) : null}

      {!activeEvent && !isLoading && visibleEvents.length === 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/92 px-3 py-2 text-xs text-zinc-600 shadow-sm">
          Inga handelser for valt filter just nu.
        </div>
      ) : null}

      {!activeEvent && !isLoading && visibleEvents.length > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/85 px-2.5 py-1.5 text-xs text-zinc-600 shadow-sm">
          {`${visibleEvents.length} handelser visas`}
        </div>
      ) : null}

      {isRefreshing ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-lg bg-white/90 px-2.5 py-1.5 text-xs text-zinc-500 shadow-sm">
          Uppdaterar data...
        </div>
      ) : null}

      {!isLoading && !isRefreshing && lastUpdatedAt ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-lg bg-white/90 px-2.5 py-1.5 text-xs text-zinc-500 shadow-sm">
          Senast uppdaterad{" "}
          {new Date(lastUpdatedAt).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Stockholm",
          })}
        </div>
      ) : null}

      {!isLoading && unavailableSources.length > 0 ? (
        <div className="pointer-events-none absolute left-3 top-[6.75rem] z-[1000] hidden rounded-lg bg-white/92 px-3 py-2 text-xs text-zinc-600 shadow-sm md:block md:top-3">
          Vissa kallor ar tillfalligt otillgangliga: {unavailableSources.join(", ")}.
        </div>
      ) : null}

      {!isLoading && geocodingFailedVisibleCount > 0 ? (
        <div className="pointer-events-none absolute left-3 top-[9.75rem] z-[1000] hidden rounded-lg bg-white/92 px-3 py-2 text-xs text-zinc-600 shadow-sm md:block md:top-16">
          {geocodingFailedVisibleCount} handelser visas utan exakt position.
        </div>
      ) : null}
    </section>
  );
}
