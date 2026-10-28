import type { MetadataRoute } from "next";

/**
 * What lets byTeam be added to a phone's home screen and open as an app, with
 * no browser bar. The icons are in public/icons; the maskable one fills the
 * whole square so Android can cut it to any shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "byTeam",
    short_name: "byTeam",
    description: "Attendance, leave and payroll for the office.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
