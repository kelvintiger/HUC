# HUC Finder

Locate Hydrologic Unit Code boundaries by searching any place or address.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create an env file:
   ```bash
   cp .env.example .env.local
   ```
3. Add your Google Maps API key and optional HUC service token in `.env.local`.

## Environment variables

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (required): Google Maps JavaScript API key with Places enabled.
- `HUC_SERVICE_URL` (required): ArcGIS REST layer URL for HUC polygons. Supports `{level}` token for layer IDs.
  - Default: `https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer`
- `HUC_SERVICE_TOKEN` (optional): Token if your ArcGIS service requires auth.

## Development

```bash
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
npm run start
```

## API

`GET /api/huc?lat=42.2808&lng=-83.7430&level=12`

Returns:

```json
{
  "query": { "lat": 42.2808, "lng": -83.743 },
  "level": "12",
  "huc": {
    "code": "040900050102",
    "name": "Huron River",
    "extra": { "sourceFields": {} }
  },
  "geometry": {
    "type": "Feature",
    "properties": { "huc": "040900050102", "level": "12" },
    "geometry": { "type": "Polygon", "coordinates": [] }
  },
  "source": { "provider": "epa wsio arcgis", "layer": "huc12" }
}
```

## Notes

- The frontend only exposes the Google Maps key. The HUC service is called from the server.
- The API caches lookups by rounded lat/lng (5 decimals) for 24 hours.
