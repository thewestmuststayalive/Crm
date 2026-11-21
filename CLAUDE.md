@AGENTS.md

# CRM – udviklerguide

Ejeren er ikke udvikler. Brugerfladen og al tekst til brugeren skal være på dansk og i et klart, professionelt sprog.

## Regler der ikke må brydes

- **Workspace-isolation:** alle CRM-tabeller har `workspace_id`. Hver forespørgsel skal filtrere på workspace-id'et fra `requireWorkspace()` (eller `requireRole()`), aldrig på et id fra brugeren. Hjælpere i `src/lib/crm.ts` tager `workspaceId` som første argument.
- **Autorisation i hver server action:** kald `requireWorkspace()`/`requireRole()` øverst i hver action og route handler. UI-tjek er kun kosmetik.
- **Id'er fra URL eller formular:** tjek med `isUuid()` før databasen, og verificér at objektet hører til workspacet (fx `getContact(workspace.id, id)`). Ugyldigt id → `notFound()`.
- **Hemmeligheder:** gem aldrig adgangskoder, tokens eller API-nøgler i klartekst eller i git. Nøgler hører i miljøvariabler (`.env`, se `.env.example`).

## Konventioner

- Next.js 16 App Router med Server Actions. `cacheComponents` er slået fra (alt er dynamisk bag login).
- Formularer: klientkomponent med `useActionState`; actions returnerer `ActionState` (`src/app/actions/types.ts`) og sender indtastede værdier tilbage ved fejl (`pickValues`), aldrig adgangskoder.
- Fælles UI i `src/components/ui.tsx` (klient) og `src/components/display.tsx` (server). Knap-klasser til `<Link>`: `buttonClass()` fra `styles.ts`.
- Databaseændringer: ret `src/db/schema.ts`, kør `npm run db:generate -- --name <navn>` og commit den genererede SQL i `drizzle/`.

## Test før push

```bash
npm run lint && npm run typecheck && npm run build && npm run test:e2e
```

E2E-tests (Playwright) kører mod databasen `crm_test`, som tømmes før hver kørsel. Nye funktioner skal have en e2e-test i `e2e/`.
