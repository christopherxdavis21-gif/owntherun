import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken } from "@/lib/mapbox.functions";

type Coord = [number, number];

interface RouteMapProps {
  coordinates: Coord[];
  onChange?: (coords: Coord[]) => void;
  editable?: boolean;
  className?: string;
  initialCenter?: Coord;
}

export function RouteMap({
  coordinates,
  onChange,
  editable = false,
  className = "",
  initialCenter,
}: RouteMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const coordsRef = useRef<Coord[]>(coordinates);
  const onChangeRef = useRef(onChange);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // keep refs current
  useEffect(() => {
    coordsRef.current = coordinates;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    getMapboxToken()
      .then((d) => setToken(d.token))
      .catch(() => setError("Map unavailable. Mapbox token not configured."));
  }, []);

  // Initialize map once token arrives
  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const center: Coord =
      initialCenter ?? (coordinates[0] as Coord) ?? [-73.9857, 40.7484]; // NYC default

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: 13,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coordsRef.current },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#c6f700",
          "line-width": 5,
          "line-opacity": 0.95,
        },
      });

      // initial markers
      renderMarkers();
      fitToRoute();
    });

    if (editable) {
      map.on("click", (e) => {
        const next: Coord[] = [...coordsRef.current, [e.lngLat.lng, e.lngLat.lat]];
        coordsRef.current = next;
        onChangeRef.current?.(next);
        updateRouteSource(next);
        renderMarkers();
      });
      map.getCanvas().style.cursor = "crosshair";
    }

    mapRef.current = map;

    function updateRouteSource(coords: Coord[]) {
      const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }

    function renderMarkers() {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      const coords = coordsRef.current;
      coords.forEach((c, i) => {
        const isFirst = i === 0;
        const isLast = i === coords.length - 1 && coords.length > 1;
        const el = document.createElement("div");
        el.style.width = isFirst || isLast ? "16px" : "10px";
        el.style.height = isFirst || isLast ? "16px" : "10px";
        el.style.borderRadius = "9999px";
        el.style.background = isFirst ? "#c6f700" : isLast ? "#ff7a3d" : "#c6f700";
        el.style.border = "2px solid #0d1117";
        el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.2)";
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(c)
          .addTo(map);
        markersRef.current.push(marker);
      });
    }

    function fitToRoute() {
      const coords = coordsRef.current;
      if (coords.length < 2) return;
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0]),
      );
      map.fitBounds(bounds, { padding: 60, duration: 0 });
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // When coordinates prop changes externally (e.g. clear/undo), sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      });
    }
    // re-render markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    coordinates.forEach((c, i) => {
      const isFirst = i === 0;
      const isLast = i === coordinates.length - 1 && coordinates.length > 1;
      const el = document.createElement("div");
      el.style.width = isFirst || isLast ? "16px" : "10px";
      el.style.height = isFirst || isLast ? "16px" : "10px";
      el.style.borderRadius = "9999px";
      el.style.background = isFirst ? "#c6f700" : isLast ? "#ff7a3d" : "#c6f700";
      el.style.border = "2px solid #0d1117";
      el.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.2)";
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(c).addTo(map);
      markersRef.current.push(marker);
    });
  }, [coordinates]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground ${className}`}
      >
        {error}
      </div>
    );
  }

  return (
    <div
      ref={mapContainer}
      className={`overflow-hidden rounded-lg border border-border ${className}`}
    />
  );
}
