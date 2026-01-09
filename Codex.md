# HUC Finder on Google Maps
Kelvin, this is a build spec you can paste into Codex and ask it to vibe code end to end.

## Goal
Build a website that shows a Google Map, lets a user search any address or place, drops a marker, looks up the Hydrologic Unit Code that contains that point, and draws the HUC boundary polygon on the map with a small info panel.

## Primary user story
1. User loads the page and sees a map centered on the Great Lakes region by default.
2. User types an address or place name in a search box.
3. User selects a suggestion.
4. App places a marker at that location.
5. App calls a backend endpoint with lat and lng to fetch the HUC result.
6. App displays:
   1. HUC code
   2. HUC level
   3. Optional name fields if available
7. App draws the returned HUC polygon on the map as an overlay.
8. App zooms map to the polygon bounds.
9. User can clear the current selection and do another search.

## Non goals
1. No user accounts.
2. No saving favorites.
3. No advanced hydrology analytics.
4. No multi point batch lookup in v1.

## UX requirements
1. Single page layout.
2. Top left search input with Google Places Autocomplete.
3. Small right side panel or bottom sheet showing the result.
4. Clear button that removes marker and polygon.
5. Loading indicator while lookup is running.
6. Error messaging:
   1. If geocode fails
   2. If HUC lookup returns nothing
   3. If backend errors

## Data and lookup strategy
We want HUC12 by default. Also support optional parameter level.
We will do point in polygon lookup via an external ArcGIS REST service in v1.
Later we can swap to PostGIS with WBD for full control.

### Backend responsibilities
1. Accept lat and lng in WGS84.
2. Query the watershed service with a point geometry.
3. Parse response attributes to extract HUC code.
4. Return a normalized JSON payload to the frontend.
5. Return polygon geometry in GeoJSON format so the frontend can draw it.

### Frontend responsibilities
1. Use Places Autocomplete for search.
2. Convert selected place to lat and lng.
3. Call backend lookup endpoint.
4. Render polygon overlay and info panel.

## Tech stack recommendation
Choose one of these. Codex can pick either, but prefer Option A.

### Option A
1. Frontend: Next.js with TypeScript
2. Backend: Next.js API routes
3. Hosting: Vercel
4. Maps: Google Maps JavaScript API

### Option B
1. Frontend: Vite React TypeScript
2. Backend: Node Express
3. Hosting: Any node host
4. Maps: Google Maps JavaScript API

## Environment variables
1. GOOGLE_MAPS_API_KEY
2. HUC_SERVICE_URL
3. HUC_SERVICE_TOKEN optional, only if the service requires it

## Backend API design
### Endpoint
GET /api/huc
Query params:
1. lat: number
2. lng: number
3. level: optional string, default "12"

Response 200 JSON
{
  "query": { "lat": 42.2808, "lng": -83.7430 },
  "level": "12",
  "huc": {
    "code": "040900050102",
    "name": "optional string",
    "extra": { "sourceFields": {} }
  },
  "geometry": {
    "type": "Feature",
    "properties": { "huc": "040900050102", "level": "12" },
    "geometry": { "type": "Polygon", "coordinates": [ ... ] }
  },
  "source": {
    "provider": "epa wsio arcgis",
    "layer": "huc12"
  }
}

Response 404 JSON
{
  "error": "No HUC found for point"
}

Response 400 JSON
{
  "error": "Invalid lat or lng"
}

Response 500 JSON
{
  "error": "Lookup failed"
}

## HUC lookup implementation notes for Codex
1. Use an ArcGIS REST query endpoint that supports:
   1. geometry as a point
   2. spatialRel intersects
   3. outFields including the HUC attribute
   4. returnGeometry true
   5. output as json
2. Convert ArcGIS geometry to GeoJSON:
   1. ArcGIS polygon uses rings
   2. GeoJSON polygon uses coordinates
   3. Handle multipolygon if returned
3. Coordinate reference system:
   1. Prefer request and response in WGS84 if possible
   2. If the service returns Web Mercator, convert to WGS84 before returning GeoJSON
4. Caching:
   1. Add a simple in memory cache keyed by rounded lat lng, like 5 decimal places
   2. Cache TTL 1 day

## Frontend map behavior
1. Initial center:
   1. Ann Arbor area or Great Lakes region
2. When result returns:
   1. Place marker at query point
   2. Draw polygon with a visible stroke and light fill
   3. Fit bounds to polygon
3. Clear button:
   1. Remove marker
   2. Remove polygon overlay
   3. Reset info panel

## Components
1. MapView
   1. Loads Google Map
   2. Manages polygon and marker overlays
2. SearchBox
   1. Places Autocomplete
   2. Emits selected place lat lng
3. InfoPanel
   1. Shows HUC code
   2. Copy button copies HUC code to clipboard
   3. Shows errors and loading state
4. Controls
   1. Clear
   2. Toggle HUC level optional

## Acceptance criteria
1. User can search by address or place name and select from suggestions.
2. App displays a HUC code for typical US addresses.
3. App draws the corresponding HUC boundary polygon.
4. Copy button copies the HUC code.
5. Clear resets the UI.
6. Errors show useful messages and do not break the map.
7. No secrets are exposed to the browser except Google Maps key.
8. Backend endpoint validates lat and lng ranges.

## Nice to have
1. Toggle between HUC8, HUC10, HUC12 if the service supports.
2. Display upstream or downstream relationships later.
3. Show a link to official HUC dataset docs later.

## What to generate in code
Deliverables:
1. Running web app with map and search.
2. Backend endpoint /api/huc that returns HUC code and GeoJSON polygon.
3. Readme with setup steps:
   1. Install
   2. Add env vars
   3. Run dev server
   4. Build and deploy

## Codex instructions
Please implement Option A using Next.js and TypeScript.
Use the Google Maps JavaScript API with Places Autocomplete.
Create /api/huc route that queries the configured HUC service URL.
Normalize output to the response schema above.
Add basic styling that looks clean and modern.
No authentication.
Do not hardcode secrets.
Include a clear README.

If you need to pick a default HUC service, pick a widely available public ArcGIS REST endpoint that returns HUC12 boundaries and attributes, and make it configurable via HUC_SERVICE_URL.