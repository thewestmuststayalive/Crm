import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isRegistrationOpen } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Opret konto" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  if (!(await isRegistrationOpen())) {
    return (
      <>
        <h1 className="text-lg font-semibold text-slate-900">Oprettelse er lukket</h1>
        <p className="mt-2 text-sm text-slate-600">
          Bed en administrator i dit firma om at tilføje dig under Indstillinger → Medlemmer.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium underline">
          Til login
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">Opret konto</h1>
      <p className="mt-1 text-sm text-slate-500">Du bliver ejer af dit første firma i Kundespor.</p>
      <div className="mt-4">
        <RegisterForm />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">
        Har du en konto?{" "}
        <Link href="/login" className="font-medium text-slate-900 underline">
          Log ind
        </Link>
      </p>
    </>
  );
}
