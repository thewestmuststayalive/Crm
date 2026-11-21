import type { Metadata } from "next";

export const metadata: Metadata = { title: "Indbakke" };

export default function InboxPage() {
  return (
    <div className="hidden h-full items-center justify-center p-8 text-sm text-slate-500 md:flex">
      Vælg en samtale til venstre.
    </div>
  );
}
