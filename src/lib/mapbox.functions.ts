import { createServerFn } from "@tanstack/react-start";

export const getMapboxToken = createServerFn({ method: "GET" }).handler(async () => {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  if (!token) throw new Error("Mapbox token not configured");
  return { token };
});
