# Stockholm Events Map

Interactive Stockholm event map with category filters and live data pipelines:
- `Brott` (Polisen)
- `Trafik` (SL)
- `Nyheter` (RSS feeds)
- `Kultur` (Visit Stockholm + Ticketmaster + optional Tickster)

Built with Next.js App Router, Leaflet and server-side event normalization/geocoding.

## Requirements

- Node.js `20.9+` (recommended: latest Node 20 LTS)
- npm

## Local Run

1. Install dependencies:
```bash
npm install
```

2. Create env file:
```bash
cp .env.example .env.local
```

3. Fill required env values in `.env.local`:
- `TICKETMASTER_API_KEY` (required for Ticketmaster culture events)
- `TICKSTER_API_KEY` (optional, only if you use Tickster)

4. Run dev server:
```bash
npm run dev
```

Open: `http://localhost:3000`

## Production Build

```bash
npm run build
npm run start
```

## Deploy to Hostinger (Business Web Hosting)

1. In hPanel, create a **Node.js App** website.
2. Connect your GitHub repository:
   - `https://github.com/tskorbenko/stockholm-events-map.git`
3. Configure app:
   - Node.js version: `20.x` or newer
   - Build command: `npm run build`
   - Start command: `npm run start`
4. Add environment variables in hPanel:
   - `TICKETMASTER_API_KEY`
   - `TICKSTER_API_KEY` (optional)
5. Deploy/redeploy app.
6. Attach your domain to this Node.js app and enable SSL.

## Notes

- The app keeps event cache snapshots in `data/events_snapshot.json` and `data/events_history.json`.
- If some source keys are missing (e.g. Tickster), app continues to work with available sources.
- If map markers seem stale after deploy, do a hard refresh in browser (`Ctrl+F5`).
