import Head from "next/head";
import Script from "next/script";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HucResponse = {
  query: { lat: number; lng: number };
  level: string;
  huc: { code: string; name?: string; extra?: { sourceFields?: Record<string, unknown> } };
  geometry: GeoJSON.Feature<GeoJSON.Geometry>;
  source: { provider: string; layer: string };
};

const DEFAULT_CENTER = { lat: 43.7, lng: -85.0 };
const DEFAULT_ZOOM = 6;

export default function Home() {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const mapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markerInstance = useRef<google.maps.Marker | null>(null);
  const dataLayerInstance = useRef<google.maps.Data | null>(null);
  const autocompleteInstance = useRef<google.maps.places.Autocomplete | null>(null);

  const [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HucResponse | null>(null);
  const [level, setLevel] = useState("12");
  const [lastQuery, setLastQuery] = useState<{ lat: number; lng: number } | null>(null);
  const lastLookupLevel = useRef<string | null>(null);

  const statusText = useMemo(() => {
    if (!googleMapsKey) return "Missing Google Maps API key.";
    if (loading) return "Looking up HUC boundary...";
    if (error) return error;
    if (result) return "HUC boundary loaded.";
    return "Search for a place to fetch its watershed boundary.";
  }, [error, loading, result, googleMapsKey]);

  const clearSelection = useCallback(() => {
    setError(null);
    setResult(null);
    setLoading(false);
    setLastQuery(null);
    if (markerInstance.current) {
      markerInstance.current.setMap(null);
      markerInstance.current = null;
    }
    if (dataLayerInstance.current) {
      dataLayerInstance.current.forEach((feature) => {
        dataLayerInstance.current?.remove(feature);
      });
    }
  }, []);

  const fitBoundsToData = useCallback(() => {
    if (!mapInstance.current || !dataLayerInstance.current) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    dataLayerInstance.current.forEach((feature) => {
      const geometry = feature.getGeometry();
      geometry?.forEachLatLng((latLng) => {
        bounds.extend(latLng);
        hasPoints = true;
      });
    });
    if (hasPoints) {
      mapInstance.current.fitBounds(bounds);
    }
  }, []);

  const applyResultToMap = useCallback(
    (lat: number, lng: number, payload: HucResponse) => {
      if (!mapInstance.current) return;
      if (markerInstance.current) {
        markerInstance.current.setMap(null);
      }
      markerInstance.current = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#0d7c66",
          fillOpacity: 1,
          scale: 7,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });

      if (dataLayerInstance.current) {
        dataLayerInstance.current.forEach((feature) => {
          dataLayerInstance.current?.remove(feature);
        });
        dataLayerInstance.current.addGeoJson(payload.geometry as GeoJSON.Feature);
        fitBoundsToData();
      }
    },
    [fitBoundsToData]
  );

  const lookupHuc = useCallback(
    async (lat: number, lng: number) => {
      setLoading(true);
      setError(null);
      setResult(null);
      lastLookupLevel.current = level;
      setLastQuery({ lat, lng });
      try {
        const params = new URLSearchParams({
          lat: lat.toString(),
          lng: lng.toString(),
          level
        });
        const response = await fetch(`/api/huc?${params.toString()}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Lookup failed");
        }
        const payload = (await response.json()) as HucResponse;
        setResult(payload);
        applyResultToMap(lat, lng, payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
      } finally {
        setLoading(false);
      }
    },
    [applyResultToMap, level]
  );

  useEffect(() => {
    if (!scriptReady || !mapRef.current || mapInstance.current || !window.google) return;

    const map = new google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false
    });
    mapInstance.current = map;

    const dataLayer = new google.maps.Data();
    dataLayer.setMap(map);
    dataLayer.setStyle({
      fillColor: "#0d7c66",
      fillOpacity: 0.15,
      strokeColor: "#0b5c4c",
      strokeWeight: 2
    });
    dataLayerInstance.current = dataLayer;

    if (inputRef.current) {
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["geometry", "formatted_address", "name"],
        types: ["geocode", "establishment"]
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
          setError("Geocode failed. Try a different place.");
          return;
        }
        const location = place.geometry.location;
        lookupHuc(location.lat(), location.lng());
      });
      autocompleteInstance.current = autocomplete;
    }
  }, [lookupHuc, scriptReady]);

  useEffect(() => {
    if (!lastQuery || loading) return;
    if (lastLookupLevel.current === level) return;
    lastLookupLevel.current = level;
    lookupHuc(lastQuery.lat, lastQuery.lng);
  }, [lastQuery, level, loading, lookupHuc]);

  return (
    <>
      <Head>
        <title>HUC Finder</title>
        <meta name="description" content="Find Hydrologic Unit Codes by address." />
      </Head>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <main>
        <div className="map-shell">
          <header>
            <h1 className="hero-title">HUC Finder</h1>
            <p className="tagline">Locate the watershed boundary for any place.</p>
          </header>
          <div className="search-card">
            <div className="search-row">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search a place or address"
                disabled={!googleMapsKey}
              />
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="8">HUC 8</option>
                <option value="10">HUC 10</option>
                <option value="12">HUC 12</option>
              </select>
            </div>
            <div className="search-row">
              <button className="secondary" onClick={clearSelection} type="button">
                Clear
              </button>
              <span className="badge">Powered by ArcGIS</span>
            </div>
          </div>
          <div id="map" ref={mapRef} />
        </div>
        <aside className="panel">
          <h2>Watershed Result</h2>
          <div className="status">{statusText}</div>
          {result ? (
            <>
              <div className="meta">
                <div>
                  <strong>HUC code:</strong> {result.huc.code}
                </div>
                <div>
                  <strong>Level:</strong> {result.level}
                </div>
                {result.huc.name ? (
                  <div>
                    <strong>Name:</strong> {result.huc.name}
                  </div>
                ) : null}
              </div>
              <div className="search-row">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(result.huc.code)}
                >
                  Copy code
                </button>
                <button className="secondary" type="button" onClick={clearSelection}>
                  Reset
                </button>
              </div>
              <div className="footer-note">
                Source: {result.source.provider} • Layer {result.source.layer}
              </div>
            </>
          ) : (
            <div className="footer-note">
              Use the search box to locate a place and fetch its HUC boundary.
            </div>
          )}
        </aside>
      </main>
    </>
  );
}
