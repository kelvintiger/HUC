## NOAA migration to non-Google stack

- Objectives: keep HUC lookup UX, run fully on NOAA infra, remove Google dependencies, host all assets/services internally or approved providers.

### Frontend (map + UI)
- Replace Google Maps with MapLibre GL JS or Leaflet; point basemap to NOAA/USGS/internal tileserver (vector: Tileserver GL/OpenMapTiles; raster: GeoServer/MapProxy).
- Remove Google `<Script>` loader; bundle map library locally and serve from NOAA host/CDN.
- Swap Places autocomplete to internal geocoder endpoint (Pelias/Photon/Census/Esri locator). Update search box to call `/api/geocode` (or WP REST equivalent) and handle lat/lng responses.
- Keep marker + GeoJSON polygon rendering, fit-to-bounds, clear/reset, loading/error states, result panel, level selector, copy button.
- Drop external font CDNs; use locally hosted fonts or system stack; ensure no other external calls/telemetry.

### Backend (services)
- Keep HUC lookup logic: validate lat/lng, cache by rounded coords for 24h, pick HUC/name fields, normalize JSON, return GeoJSON polygon.
- Point HUC service to NOAA-hosted ArcGIS Server/GeoServer/PostGIS endpoint via env `HUC_SERVICE_URL` and optional token; keep token server-side only.
- Add geocode/autocomplete API that proxies internal geocoder; browser never calls external services directly.
- If using PostGIS instead of ArcGIS: implement point-in-polygon query and return same payload shape.

### WordPress option
- Wrap frontend bundle in a plugin/block/shortcode rendering a root `<div>`.
- Enqueue built JS/CSS; inject config (public tile URL, API paths) via `wp_localize_script`.
- Implement WP REST routes `/wp-json/huc-finder/v1/huc` and `/wp-json/huc-finder/v1/geocode` that proxy internal services, validate input, cache, and hide tokens.

### Hosting/deployment
- Serve all static assets (JS/CSS/fonts) from NOAA-controlled hosts; disable external analytics.
- Run app behind NOAA HTTPS/reverse proxy; add rate limiting/logging per policy.
- Configure env vars/secrets via NOAA-approved mechanism; no secrets in frontend bundles.

### Data/licensing/compliance
- Verify basemap/geocoder data licenses allow internal hosting; document sources.
- Ensure ATO controls: HTTPS, content security policy restricting to internal hosts, no third-party calls.
- Maintain accessibility basics (labels, focus states, contrast) after map swap.

### Testing/verification
- Map loads with internal tiles; no blocked external requests.
- Geocode → lat/lng → marker + polygon renders; HUC data matches expected for sample points.
- Cache behavior confirmed; errors surface clearly without breaking UI.
- Test in target browsers and mobile; check WP integration if applicable.
