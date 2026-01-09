import type { NextApiRequest, NextApiResponse } from "next";

type ArcGisFeature = {
  attributes: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
  };
};

type HucResponse = {
  query: { lat: number; lng: number };
  level: string;
  huc: {
    code: string;
    name?: string;
    extra?: { sourceFields?: Record<string, unknown> };
  };
  geometry: {
    type: "Feature";
    properties: { huc: string; level: string };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  };
  source: { provider: string; layer: string };
};

type CacheEntry = { expiresAt: number; payload: HucResponse };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const DEFAULT_SERVICE_URL =
  "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer";

const LEVEL_TO_LAYER: Record<string, string> = {
  "8": "4",
  "10": "5",
  "12": "6"
};

function parseNumber(value: string | string[] | undefined): number | null {
  if (!value || Array.isArray(value)) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeLevel(value: string | string[] | undefined): string {
  if (!value || Array.isArray(value)) return "12";
  const trimmed = value.trim();
  return trimmed || "12";
}

function isValidLatLng(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function getCacheKey(lat: number, lng: number, level: string): string {
  const roundedLat = lat.toFixed(5);
  const roundedLng = lng.toFixed(5);
  return `${roundedLat}:${roundedLng}:${level}`;
}

function pickHucField(attributes: Record<string, unknown>, level: string): string | null {
  const keys = Object.keys(attributes);
  const levelLower = level.toLowerCase();
  const direct = keys.find((key) => {
    const lower = key.toLowerCase();
    return lower === `huc${levelLower}` || lower === `huc_${levelLower}`;
  });
  if (direct) return direct;

  const fallback = keys.find((key) => key.toLowerCase().includes("huc"));
  return fallback || null;
}

function pickNameField(attributes: Record<string, unknown>, level: string): string | null {
  const candidates = [
    "name",
    `huc${level}_name`,
    `huc${level}name`,
    "gnis_name",
    "gnisname",
    "huc_name"
  ];
  const keys = Object.keys(attributes);
  const found = keys.find((key) =>
    candidates.includes(key.toLowerCase())
  );
  return found || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const lat = parseNumber(req.query.lat);
  const lng = parseNumber(req.query.lng);
  const level = normalizeLevel(req.query.level);

  if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
    res.status(400).json({ error: "Invalid lat or lng" });
    return;
  }

  const cacheKey = getCacheKey(lat, lng, level);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.status(200).json(cached.payload);
    return;
  }

  const serviceUrl = process.env.HUC_SERVICE_URL || DEFAULT_SERVICE_URL;
  const layerToken = LEVEL_TO_LAYER[level] || level;
  const resolvedUrl = serviceUrl.includes("{level}")
    ? serviceUrl.replace("{level}", layerToken)
    : serviceUrl;
  const layerUrl = resolvedUrl.replace(/\/$/, "").endsWith("/MapServer")
    ? `${resolvedUrl.replace(/\/$/, "")}/${layerToken}`
    : resolvedUrl;
  const queryUrl = `${layerUrl.replace(/\/$/, "")}/query`;

  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json"
  });

  if (process.env.HUC_SERVICE_TOKEN) {
    params.set("token", process.env.HUC_SERVICE_TOKEN);
  }

  try {
    const response = await fetch(`${queryUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Service error: ${response.status}`);
    }
    const data = (await response.json()) as { features?: ArcGisFeature[] };

    if (!data.features || data.features.length === 0) {
      res.status(404).json({ error: "No HUC found for point" });
      return;
    }

    const feature = data.features[0];
    const attributes = feature.attributes || {};
    const hucKey = pickHucField(attributes, level);
    const hucCode = hucKey ? String(attributes[hucKey]) : "";
    if (!hucCode) {
      res.status(404).json({ error: "No HUC found for point" });
      return;
    }

    const nameKey = pickNameField(attributes, level);
    const nameValue = nameKey ? String(attributes[nameKey]) : undefined;

    const rings = feature.geometry?.rings;
    if (!rings) {
      res.status(500).json({ error: "Lookup failed" });
      return;
    }

    const payload: HucResponse = {
      query: { lat, lng },
      level,
      huc: {
        code: hucCode,
        name: nameValue || undefined,
        extra: { sourceFields: attributes }
      },
      geometry: {
        type: "Feature",
        properties: { huc: hucCode, level },
        geometry: {
          type: "Polygon",
          coordinates: rings
        }
      },
      source: {
        provider: "epa wsio arcgis",
        layer: `huc${level}`
      }
    };

    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ error: "Lookup failed" });
  }
}
