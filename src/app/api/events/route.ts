import { NextResponse } from "next/server";
import { getEventsSnapshot } from "@/lib/services/eventsPipelineService";
import type { EventsApiResponse } from "@/lib/events/types";

export async function GET() {
  const startedAt = Date.now();
  try {
    const snapshot = await getEventsSnapshot();
    console.info(
      `[api/events] status=ok ms=${Date.now() - startedAt} events=${snapshot.events.length}`,
    );

    return NextResponse.json(
      snapshot satisfies EventsApiResponse,
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  } catch {
    // Last-resort safety net: always return a JSON array.
    console.error(`[api/events] status=error ms=${Date.now() - startedAt}`);
    return NextResponse.json(
      {
        events: [],
        meta: { unavailable_sources: ["Polisen", "SL", "Nyheter", "Visit Stockholm", "Ticketmaster", "Tickster"] },
      } satisfies EventsApiResponse,
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
