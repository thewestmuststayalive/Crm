# CRM

Et CRM til kunder, salg og opfølgning på tværs af flere firmaer. Hvert firma (workspace) har sine egne data og medlemmer, og du skifter mellem dem i menuen – eller ser dem samlet på dashboardet.

**Guides:** [Sæt i drift (Vercel + Neon)](docs/drift.md) · [Opsætning af Facebook og Instagram](docs/meta-opsaetning.md)

## Funktioner

| Område | Indhold |
| ------ | ------- |
| Firmaer og brugere | Flere firmaer pr. konto, roller (ejer/admin/medarbejder), beskyttelse mod gætteforsøg ved login |
| Kunder | Kontaktpersoner og virksomheder, status (lead/kunde), kilde, ansvarlig, søgning, CSV-eksport |
| Tidslinje | Noter, opkald, e-mails, møder og automatiske hændelser |
| Pipeline | Deals med værdi og faser, kanban med træk-og-slip; vundet deal gør kontakten til kunde |
| Opgaver | Frist og ansvarlig; forfaldne, i dag og kommende |
| Kontaktformular | Kode til dine hjemmesider; henvendelser bliver automatisk til leads, deals og opgaver |
| Meta Lead Ads | Leads fra Facebook/Instagram-annoncer importeres automatisk (afventer nøgler) |
| Indbakke | Messenger og Instagram Direct samlet, med svar fra CRM'et (afventer nøgler) |
| Annoncer | Forbrug, leads, pris pr. lead og afkast pr. kampagne (afventer nøgler) |
| Dashboard | Nøgletal for ét firma eller alle samlet |

## Teknologi

- Next.js 16 (App Router, Server Actions) og TypeScript
- PostgreSQL med Drizzle ORM
- Tailwind CSS
- Egen login-løsning: adgangskoder hashes med scrypt, og sessioner gemmes i databasen (kun en SHA-256-hash af tokenet)
- Meta-tokens krypteres med AES-256-GCM (`ENCRYPTION_KEY`)

## Kom i gang lokalt

Kræver Node.js 20+ og PostgreSQL 16 (eller Docker).

```bash
cp .env.example .env
docker compose up -d        # starter PostgreSQL
npm install
npm run db:migrate          # opretter tabellerne
npm run dev
```

Åbn http://localhost:3000. Den første bruger, der opretter sig, bliver ejer af sit firma. Derefter er oprettelse lukket, og nye medarbejdere tilføjes under **Indstillinger → Medlemmer**.

## Roller

| Rolle | Kan |
| ----- | --- |
| Ejer | Alt, inklusive at gøre andre til ejere |
| Admin | Omdøbe firmaet, styre medlemmer (ikke ejere), kontaktformularer og Meta-forbindelse, slette data |
| Medarbejder | Arbejde med kunder, deals, opgaver og beskeder i firmaet |

Et firma har altid mindst én ejer.

## Scripts

| Kommando | Formål |
| -------- | ------ |
| `npm run dev` | Udviklingsserver |
| `npm run build` / `npm start` | Produktionsbuild og -server |
| `npm run lint` / `npm run typecheck` | Kodekvalitet |
| `npm run db:generate` | Lav en ny migrering efter ændringer i `src/db/schema.ts` |
| `npm run db:migrate` | Kør migreringer mod databasen |
| `npm run db:studio` | Se databasen i browseren |
| `npm run test:e2e` | Browsertests (kræver `npm run build` og databasen `crm_test`) |

E2E-testene simulerer Metas API (`e2e/meta-mock.ts`), så hele Meta-integrationen testes uden rigtige nøgler. GitHub Actions kører lint, typetjek, build og alle tests ved hver pull request.

## Struktur

```
src/
  app/
    (auth)/          login og oprettelse
    (app)/           alt bag login: dashboard, kunder, pipeline, opgaver, indbakke, annoncer, indstillinger
    actions/         server actions (al skrivning til databasen)
    api/leads/       offentligt endpoint til kontaktformularer
    api/meta/        Facebook-login og webhook til leads og beskeder
    api/cron/        daglig hentning af annoncedata
  db/                databaseskema og forbindelse
  lib/               login, roller, CRM-forespørgsler, leads, Meta-klient
drizzle/             SQL-migreringer
e2e/                 Playwright-tests og simuleret Meta API
docs/                guides til drift og Meta
```
