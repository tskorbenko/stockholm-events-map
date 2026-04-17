"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { StockholmMap } from "@/components/map/StockholmMap";

export default function Home() {
  const [mapLoadingState, setMapLoadingState] = useState({ isLoading: true, progress: 0 });

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white">
      <SiteHeader />
      <div
        className="relative h-px w-full overflow-hidden bg-zinc-200/40"
        role="progressbar"
        aria-live="polite"
        aria-label={mapLoadingState.isLoading ? "Karta laddas" : "Karta laddad"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={mapLoadingState.progress}
      >
        <div
          className={`h-px transition-[width,opacity] duration-300 ease-out ${mapLoadingState.isLoading ? "opacity-100" : "opacity-0"}`}
          style={{ width: `${mapLoadingState.progress}%`, backgroundColor: "#78b0ff" }}
        />
      </div>
      <StockholmMap onLoadingStateChange={setMapLoadingState} />
    </main>
  );
}
