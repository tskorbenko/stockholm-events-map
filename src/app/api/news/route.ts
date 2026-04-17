import { NextResponse } from "next/server";
import { fetchNewsFeedItems } from "@/lib/services/newsFeedService";

export async function GET() {
  try {
    const items = await fetchNewsFeedItems(40);
    return NextResponse.json(
      { items },
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  } catch {
    return NextResponse.json(
      { items: [] },
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}

