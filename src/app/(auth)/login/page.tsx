import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isRegistrationOpen } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const canRegister = await isRegistrationOpen();

  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">Log ind</h1>
      <div className="mt-4">
        <LoginForm />
      </div>
      <p className="mt-4 text-center text-sm">
        <Link href="/glemt-adgangskode" className="text-brand-700 underline">
          Glemt adgangskode?
        </Link>
      </p>
      {canRegister && (
        <p className="mt-4 text-center text-sm text-slate-500">
          Ingen konto?{" "}
          <Link href="/registrer" className="font-medium text-slate-900 underline">
            Opret konto
          </Link>
        </p>
      )}
    </>
  );
}
