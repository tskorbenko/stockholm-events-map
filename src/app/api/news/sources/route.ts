import { NextResponse } from "next/server";
import { getNewsSources } from "@/lib/config/newsSources";

export async function GET() {
  try {
    const sources = getNewsSources();
    return NextResponse.json(
      { sources, total: sources.length },
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  } catch {
    return NextResponse.json(
      { sources: [], total: 0 },
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
