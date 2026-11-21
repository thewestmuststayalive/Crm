import Link from "next/link";
import { LogoMark } from "@/components/brand";
import { buttonClass } from "@/components/styles";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <LogoMark size={40} className="mx-auto" />
        <h1 className="mt-6 text-xl font-semibold text-slate-900">Siden findes ikke</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sporet er koldt her. Siden er måske slettet, eller den hører til et andet af dine firmaer.
        </p>
        <Link href="/dashboard" className={buttonClass("primary", "mt-6")}>
          Til forsiden
        </Link>
      </div>
    </main>
  );
}
