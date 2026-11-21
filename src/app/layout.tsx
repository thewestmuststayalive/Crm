import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Kundespor", template: "%s · Kundespor" },
  description: "Alle kunder samlet. Ingen glemt. Kundespor samler henvendelser, salg og opfølgning på tværs af dine firmaer.",
  applicationName: "Kundespor",
};

export const viewport: Viewport = {
  themeColor: "#1b6257",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
