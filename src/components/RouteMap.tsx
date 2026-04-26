import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken } from "@/lib/mapbox.functions";

type Coord = [number, number];

export type MapPin = {
  id: string;
  coord: Coord;
  color?: string; // CSS color, defaults to primary
  label?: string;
  popupHtml?: string;
  onClick?: () => void;
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

  // Initialize map once token arrives
  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const center: Coord =
      initialCenter ?? (coordinates[0] as Coord) ?? [-73.9857, 40.7484];

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
        data: lineFeature(pathRef.current ?? coordsRef.current),
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#c6f700", "line-width": 5, "line-opacity": 0.95 },
      });

      // Planned (dashed orange) overlay
      map.addSource("planned", {
        type: "geojson",
        data: lineFeature(plannedPath ?? []),
      });
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

      renderMarkers();
      renderPins();
      renderUser();
      fitToContent();
    });

    if (editable) {
      map.on("click", (e) => {
        const next: Coord[] = [...coordsRef.current, [e.lngLat.lng, e.lngLat.lat]];
        coordsRef.current = next;
        onChangeRef.current?.(next);
        const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData(lineFeature(next));
        renderMarkers();
      });
      map.getCanvas().style.cursor = "crosshair";
    }

    mapRef.current = map;

    function renderMarkers() {
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

    function renderPins() {
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

    function renderUser() {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (!userLocation) return;
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "9999px";
      el.style.background = "#3b82f6";
      el.style.border = "3px solid #ffffff";
      el.style.boxShadow = "0 0 0 4px rgba(59,130,246,0.25)";
      userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userLocation).addTo(map);
    }

    function fitToContent() {
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

  // Sync line and waypoints
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(lineFeature(pathCoordinates ?? coordinates));

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    coordinates.forEach((c, i) => {
      const isFirst = i === 0;
      const isLast = i === coordinates.length - 1 && coordinates.length > 1;
      const el = waypointEl(isFirst, isLast);
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(c).addTo(map);
      markersRef.current.push(marker);
    });
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
  }, [pins]);

  // Sync user location dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userLocation) return;
    const el = document.createElement("div");
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "9999px";
    el.style.background = "#3b82f6";
    el.style.border = "3px solid #ffffff";
    el.style.boxShadow = "0 0 0 4px rgba(59,130,246,0.25)";
    userMarkerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(userLocation).addTo(map);
  }, [userLocation]);

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted-foreground ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div ref={mapContainer} className={`overflow-hidden rounded-lg border border-border ${className}`} />
  );
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
