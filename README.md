# CRM

Et CRM til kunder, salg og opfølgning på tværs af flere firmaer. Hvert firma (workspace) har sine egne data og medlemmer, og du skifter mellem dem i menuen.

## Status

| Fase | Indhold | Status |
| ---- | ------- | ------ |
| 1 | Login, firmaer (workspaces), medlemmer og roller | Færdig |
| 2 | Kunder, kontakter og noter | Planlagt |
| 3 | Pipeline og opgaver | Planlagt |
| 4 | Kontaktformular og leads | Planlagt |
| 5 | Meta: Lead Ads og annonceforbrug | Planlagt |
| 6 | Indbakke: Messenger og Instagram | Planlagt |
| 7 | Dashboard med nøgletal | Planlagt |
| 8 | Guide til hosting og Meta-godkendelse | Planlagt |

## Teknologi

- Next.js 16 (App Router, Server Actions) og TypeScript
- PostgreSQL med Drizzle ORM
- Tailwind CSS
- Egen login-løsning: adgangskoder hashes med scrypt, og sessioner gemmes i databasen (kun en SHA-256-hash af tokenet)

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
| Admin | Omdøbe firmaet, tilføje og fjerne medlemmer (ikke ejere) |
| Medarbejder | Arbejde med CRM-data i firmaet |

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

## Struktur

```
src/
  app/
    (auth)/        login og oprettelse
    (app)/         alt bag login: dashboard og indstillinger
    actions/       server actions (al skrivning til databasen)
  db/              databaseskema og forbindelse
  lib/             login, sessioner og roller
drizzle/           SQL-migreringer
```
