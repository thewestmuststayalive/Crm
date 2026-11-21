# Sæt CRM'et i drift

Denne guide sætter CRM'et online på **Vercel** (selve appen) og **Neon** (databasen). Begge kører i EU, og opsætningen tager ca. 30 minutter.

## 1. Konti du skal oprette

| Tjeneste | Formål | Pris (vejledende) |
| -------- | ------ | ----------------- |
| [Neon](https://neon.tech) | PostgreSQL-database | Gratis til at starte med (0,5 GB) |
| [Vercel](https://vercel.com) | Hosting af appen | **Pro-plan påkrævet til erhvervsbrug** (ca. 20 USD/md.). Gratisplanen (Hobby) må kun bruges til ikke-kommerciel brug. |
| Eget domæne | Fx `crm.ditfirma.dk` | Du har det sikkert allerede |

> **GDPR:** CRM'et indeholder persondata om dine kunder. Vælg EU-regioner (se nedenfor), og accepter databehandleraftalerne (DPA) hos både Vercel og Neon. De ligger i deres indstillinger under "Legal"/"Privacy".

## 2. Database (Neon)

1. Opret et projekt i Neon. Vælg regionen **AWS Europe Central (Frankfurt)**.
2. Kopiér forbindelsesadressen (connection string) med **pooling slået til**. Den ligner `postgres://bruger:kode@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

## 3. Appen (Vercel)

1. Log ind på Vercel med GitHub, og importér repo'et `thewestmuststayalive/crm`.
2. Under **Settings → Functions** vælges regionen **Frankfurt (fra1)**, så appen ligger tæt på databasen.
3. Under **Settings → Environment Variables** indsættes:

| Variabel | Værdi |
| -------- | ----- |
| `DATABASE_URL` | Forbindelsesadressen fra Neon |
| `APP_URL` | Den endelige adresse, fx `https://crm.ditfirma.dk` |
| `ENCRYPTION_KEY` | Generér med `openssl rand -base64 32` (eller bed udvikleren om en). **Gem den sikkert – mister du den, skal Facebook forbindes igen.** |
| `CRON_SECRET` | En lang tilfældig tekst (fx endnu en `openssl rand -base64 32`) |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Fra Meta-appen – se [meta-opsaetning.md](./meta-opsaetning.md). Kan tilføjes senere. |
| `ALLOW_REGISTRATION` | `false` |

4. Tryk **Deploy**. Databasetabellerne oprettes automatisk ved hver deploy (`vercel-build` kører migreringerne).
5. Under **Settings → Domains** tilføjes dit domæne, og du følger Vercels vejledning til DNS.

## 4. Første login

1. Åbn `https://crm.ditfirma.dk/registrer`, og opret dig selv. Den første bruger bliver ejer, og derefter lukkes for nye oprettelser.
2. Opret dine øvrige firmaer under **Indstillinger → Firma**.
3. Tilføj medarbejdere under **Indstillinger → Medlemmer**.

## 5. Automatik

- **Annoncedata** hentes hver morgen kl. ca. 06–07 dansk tid via Vercel Cron (`vercel.json`). Vercel sender automatisk `CRON_SECRET` med.
- **Sundhedstjek:** `https://crm.ditfirma.dk/api/health` svarer `{"ok":true}`, når appen kører. Kan bruges til overvågning (fx UptimeRobot).

## 6. Backup

Neon tager automatisk backup og kan gendanne til et vilkårligt tidspunkt (7 dage på gratisplanen, længere på betalte planer). Til ekstra sikkerhed kan kontakter eksporteres som CSV fra **Kunder → Eksportér CSV**.

## Fejlfinding

| Problem | Løsning |
| ------- | ------- |
| "Meta er ikke sat op endnu" | `META_*` og `ENCRYPTION_KEY` mangler i Vercel. Tilføj dem og deploy igen. |
| Kontaktformularen virker ikke på hjemmesiden | Tjek at `APP_URL` er den rigtige adresse, og at koden er kopieret fra **Indstillinger → Kontaktformular** efter den blev sat. |
| Login siger "For mange forkerte forsøg" | Vent 15 minutter. Beskyttelsen mod gætteforsøg nulstilles af sig selv. |
