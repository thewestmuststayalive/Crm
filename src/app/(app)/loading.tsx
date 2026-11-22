/** Vises med det samme, mens en side hentes – så appen føles hurtig. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-6" aria-busy="true" aria-label="Indlæser">
      <div className="h-8 w-56 rounded-md bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-slate-200/70" />
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-slate-200/80" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
