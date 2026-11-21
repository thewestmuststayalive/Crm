import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Glemt adgangskode" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">Glemt adgangskode</h1>
      <p className="mt-1 text-sm text-slate-500">Skriv din e-mail, så sender vi et link til at vælge en ny.</p>
      <div className="mt-4">
        <ForgotForm />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-700 underline">
          Tilbage til login
        </Link>
      </p>
    </>
  );
}
