import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kundespor", template: "%s · Kundespor" },
  description: "Alle kunder samlet. Ingen glemt. Kundespor samler henvendelser, salg og opfølgning på tværs af dine firmaer.",
  applicationName: "Kundespor",
  // Åbner i fuld skærm, når Kundespor er lagt på hjemmeskærmen på iPhone.
  appleWebApp: { capable: true, title: "Kundespor", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1b6257",
  // Lader siden bruge hele skærmen; menuen nederst holder selv afstand til iPhonens kant.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
