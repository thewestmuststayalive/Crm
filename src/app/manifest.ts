import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kundespor",
    short_name: "Kundespor",
    description: "Alle kunder samlet. Ingen glemt.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#1b6257",
    lang: "da",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // Genveje, når man holder fingeren på app-ikonet (Android).
    shortcuts: [
      { name: "Indbakke", url: "/indbakke" },
      { name: "Kunder", url: "/kunder" },
      { name: "Ny kontakt", url: "/kunder/ny" },
      { name: "Opgaver", url: "/opgaver" },
    ],
  };
}
