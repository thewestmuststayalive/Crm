import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CRM", template: "%s · CRM" },
  description: "CRM til kunder, salg og opfølgning på tværs af dine firmaer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
