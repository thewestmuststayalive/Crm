/** Vejledninger til at sætte Google Maps- og CVR-søgning op. Vises, indtil nøglerne er sat. */

export function GoogleGuide() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
      <li>
        Gå til <span className="font-medium">console.cloud.google.com</span> og opret et projekt (fx
        &quot;Kundespor&quot;).
      </li>
      <li>Tilføj et betalingskort under Fakturering. Google kræver det, selv om de første 1.000 søgninger pr. måned er gratis.</li>
      <li>
        Søg efter <span className="font-medium">Places API (New)</span> og klik &quot;Aktivér&quot;.
      </li>
      <li>
        Gå til &quot;API&apos;er og tjenester → Loginoplysninger&quot;, klik &quot;Opret loginoplysninger → API-nøgle&quot;, og
        begræns nøglen til Places API (New).
      </li>
      <li>
        Sæt et dagligt loft under &quot;Kvoter&quot; (fx 50 pr. dag), så regningen aldrig kan løbe løbsk.
      </li>
      <li>
        I Vercel: Settings → Environment Variables → tilføj <code className="rounded bg-slate-100 px-1">GOOGLE_PLACES_API_KEY</code>{" "}
        med nøglen, og tryk &quot;Redeploy&quot;. Nøglen må ikke sendes på mail eller i chat.
      </li>
    </ol>
  );
}

export function CvrGuide() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
      <li>
        Send en mail til <span className="font-medium">cvrselvbetjening@erst.dk</span> og bed om
        &quot;system-til-system-adgang til CVR&quot; (gratis). Skriv firmanavn, CVR-nummer og at data bruges til at finde
        erhvervskunder.
      </li>
      <li>Erhvervsstyrelsen sender et brugernavn og en adgangskode – typisk inden for få dage.</li>
      <li>
        I Vercel: tilføj <code className="rounded bg-slate-100 px-1">CVR_ES_USER</code> og{" "}
        <code className="rounded bg-slate-100 px-1">CVR_ES_PASSWORD</code>, og tryk &quot;Redeploy&quot;.
      </li>
    </ol>
  );
}
