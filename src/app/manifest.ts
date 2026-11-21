import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kundespor",
    short_name: "Kundespor",
    description: "Alle kunder samlet. Ingen glemt.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#1b6257",
    lang: "da",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
