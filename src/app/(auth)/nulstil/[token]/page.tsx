import type { Metadata } from "next";
import Link from "next/link";
import { findValidToken } from "@/lib/tokens";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Vælg adgangskode", robots: { index: false } };

export default async function SetPasswordPage({ params }: PageProps<"/nulstil/[token]">) {
  const { token } = await params;
  const valid = await findValidToken(token);

  if (!valid) {
    return (
      <>
        <h1 className="text-lg font-semibold text-slate-900">Linket virker ikke</h1>
        <p className="mt-2 text-sm text-slate-600">Linket er udløbet eller allerede brugt.</p>
        <Link href="/glemt-adgangskode" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Bed om et nyt link
        </Link>
      </>
    );
  }

  const invite = valid.purpose === "INVITE";
  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">
        {invite ? `Velkommen, ${valid.name.split(" ")[0]}` : "Vælg en ny adgangskode"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {invite ? "Vælg en adgangskode, så er du klar til at bruge Kundespor." : valid.email}
      </p>
      <div className="mt-4">
        <SetPasswordForm token={token} submitLabel={invite ? "Kom i gang" : "Gem adgangskode"} />
      </div>
    </>
  );
}
