import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken } from "@/lib/mapbox.functions";
import { Layers, Box } from "lucide-react";

type Coord = [number, number];

export type MapPin = {
  id: string;
  coord: Coord;
  color?: string; // CSS color, defaults to primary
  label?: string;
  popupHtml?: string;
  onClick?: () => void;
};

export type MapStyleId = "dark" | "streets" | "satellite" | "outdoors";

const STYLE_URLS: Record<MapStyleId, string> = {
  dark: "mapbox://styles/mapbox/dark-v11",
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  outdoors: "mapbox://styles/mapbox/outdoors-v12",
};

const STYLE_LABELS: Record<MapStyleId, string> = {
  dark: "Dark",
  streets: "Streets",
  satellite: "Satellite",
  outdoors: "Outdoors",
};

interface RouteMapProps {
  coordinates: Coord[];
  /** Optional snapped polyline to render along roads instead of straight lines between waypoints. */
  pathCoordinates?: Coord[];
  /** Faint dashed overlay path (e.g. a suggested route to follow) */
  plannedPath?: Coord[];
  /** Extra pins to render on the map (e.g. nearby routes) */
  pins?: MapPin[];
  /** Render a "you are here" dot at this location */
  userLocation?: Coord;
  onChange?: (coords: Coord[]) => void;
  editable?: boolean;
  className?: string;
  initialCenter?: Coord;
  /** Show the style/3D toggle controls. Defaults to true. */
  showViewControls?: boolean;
}

export function RouteMap({
  coordinates,
  pathCoordinates,
  plannedPath,
  pins,
  userLocation,
  onChange,
  editable = false,
  className = "",
  initialCenter,
  showViewControls = true,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const pinMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const coordsRef = useRef<Coord[]>(coordinates);
  const pathRef = useRef<Coord[] | undefined>(pathCoordinates);
  const onChangeRef = useRef(onChange);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<MapStyleId>("dark");
  const [is3d, setIs3d] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);

  useEffect(() => {
    coordsRef.current = coordinates;
    pathRef.current = pathCoordinates;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    getMapboxToken()
      .then((d) => setToken(d.token))
      .catch(() => setError("Map unavailable. Mapbox token not configured."));
  }, []);

  // (Re)apply route + pins layers — used after init AND after a style change.
  const applyLayersAndMarkers = (map: mapboxgl.Map) => {
    if (!map.getSource("route")) {
      map.addSource("route", {
        type: "geojson",
        data: lineFeature(pathRef.current ?? coordsRef.current),
      });
    }
    if (!map.getLayer("route-line")) {
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#c6f700", "line-width": 5, "line-opacity": 0.95 },
      });
    }

    if (!map.getSource("planned")) {
      map.addSource("planned", {
        type: "geojson",
        data: lineFeature(plannedPath ?? []),
      });
    }
    if (!map.getLayer("planned-line")) {
      map.addLayer({
        id: "planned-line",
        type: "line",
        source: "planned",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ff7a3d",
          "line-width": 4,
          "line-opacity": 0.7,
          "line-dasharray": [2, 1.5],
        },
      });
    }

    renderMarkers(map);
    renderPins(map);
    renderUser(map);
    apply3d(map, is3d);
  };

  // Initialize map once token arrives
  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const center: Coord =
      initialCenter ?? (coordinates[0] as Coord) ?? [-73.9857, 40.7484];

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: STYLE_URLS[styleId],
      center,
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");

    map.on("load", () => {
      applyLayersAndMarkers(map);
      fitToContent(map);
    });

    if (editable) {
      map.on("click", (e) => {
        const next: Coord[] = [...coordsRef.current, [e.lngLat.lng, e.lngLat.lat]];
        coordsRef.current = next;
        onChangeRef.current?.(next);
        const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData(lineFeature(next));
        renderMarkers(map);
      });
      map.getCanvas().style.cursor = "crosshair";
    }

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      pinMarkersRef.current.forEach((m) => m.remove());
      if (userMarkerRef.current) userMarkerRef.current.remove();
      markersRef.current = [];
      pinMarkersRef.current = [];
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Switch base style without losing route data/markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLE_URLS[styleId]);
    const onStyleLoad = () => {
      applyLayersAndMarkers(map);
    };
    map.once("style.load", onStyleLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId]);

  // Toggle 3D terrain + pitched camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    apply3d(map, is3d);
  }, [is3d]);

  function renderMarkers(map: mapboxgl.Map) {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const coords = coordsRef.current;
    coords.forEach((c, i) => {
      const isFirst = i === 0;
      const isLast = i === coords.length - 1 && coords.length > 1;
      const el = waypointEl(isFirst, isLast);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(c).addTo(map);
      markersRef.current.push(marker);
    });
  }

  function renderPins(map: mapboxgl.Map) {
    pinMarkersRef.current.forEach((m) => m.remove());
    pinMarkersRef.current = [];
    (pins ?? []).forEach((p) => {
      const el = pinEl(p.color ?? "#c6f700");
      if (p.onClick) el.addEventListener("click", (ev) => { ev.stopPropagation(); p.onClick!(); });
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(p.coord);
      if (p.popupHtml) {
        marker.setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(p.popupHtml));
      }
      marker.addTo(map);
      pinMarkersRef.current.push(marker);
    });
  }

  function renderUser(map: mapboxgl.Map) {
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userLocation) return;
    const el = userDotEl();
    userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userLocation).addTo(map);
  }

  function fitToContent(map: mapboxgl.Map) {
    const all: Coord[] = [
      ...(coordsRef.current ?? []),
      ...(plannedPath ?? []),
      ...((pins ?? []).map((p) => p.coord)),
    ];
    if (userLocation) all.push(userLocation);
    if (all.length < 2) return;
    const bounds = all.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(all[0], all[0]),
    );
    map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 15 });
  }

  // Sync line and waypoints
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(lineFeature(pathCoordinates ?? coordinates));
    renderMarkers(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinates, pathCoordinates]);

  // Sync planned overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("planned") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(lineFeature(plannedPath ?? []));
  }, [plannedPath]);

  // Sync pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    renderPins(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  // Sync user location dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    renderUser(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border ${className}`}>
      <div ref={mapContainer} className="h-full w-full" />

      {showViewControls && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-2">
          <div className="pointer-events-auto relative">
            <button
              type="button"
              onClick={() => setStyleMenuOpen((o) => !o)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 text-xs font-semibold shadow backdrop-blur hover:bg-surface"
              aria-label="Change map style"
            >
              <Layers className="h-3.5 w-3.5" />
              {STYLE_LABELS[styleId]}
            </button>
            {styleMenuOpen && (
              <div className="absolute bottom-10 left-0 w-36 overflow-hidden rounded-md border border-border bg-background/95 shadow-lg backdrop-blur">
                {(Object.keys(STYLE_URLS) as MapStyleId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setStyleId(id);
                      setStyleMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-xs hover:bg-surface ${
                      id === styleId ? "font-semibold text-primary" : ""
                    }`}
                  >
                    {STYLE_LABELS[id]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIs3d((v) => !v)}
            className={`pointer-events-auto flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow backdrop-blur transition-colors ${
              is3d
                ? "border-primary/60 bg-primary/15 text-primary hover:bg-primary/20"
                : "border-border bg-background/95 hover:bg-surface"
            }`}
            aria-label="Toggle 3D"
            aria-pressed={is3d}
          >
            <Box className="h-3.5 w-3.5" />
            3D
          </button>
        </div>
      )}
    </div>
  );
}

function apply3d(map: mapboxgl.Map, enabled: boolean) {
  if (enabled) {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.4 });
    map.easeTo({ pitch: 60, bearing: -20, duration: 600 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }
}

function lineFeature(coords: Coord[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
}

function waypointEl(isFirst: boolean, isLast: boolean) {
  const el = document.createElement("div");
  el.style.width = isFirst || isLast ? "16px" : "10px";
  el.style.height = isFirst || isLast ? "16px" : "10px";
  el.style.borderRadius = "9999px";
  el.style.background = isFirst ? "#c6f700" : isLast ? "#ff7a3d" : "#c6f700";
  el.style.border = "2px solid #0d1117";
  el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.2)";
  return el;
}

function pinEl(color: string) {
  const el = document.createElement("div");
  el.style.width = "22px";
  el.style.height = "22px";
  el.style.borderRadius = "9999px";
  el.style.background = color;
  el.style.border = "3px solid #0d1117";
  el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.4), 0 4px 10px rgba(0,0,0,0.4)";
  el.style.cursor = "pointer";
  return el;
}

function userDotEl() {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "9999px";
  el.style.background = "#3b82f6";
  el.style.border = "3px solid #ffffff";
  el.style.boxShadow = "0 0 0 4px rgba(59,130,246,0.25)";
  return el;
}
