# Sæt CRM'et i drift

CRM'et kører på **Vercel** (selve programmet) med en **Neon**-database (alle data). Begge har gratis planer, og opsætningen tager ca. 15 minutter.

## Hvilken plan?

| Brug | Vercel-plan | Neon-plan |
| ---- | ----------- | --------- |
| Privat / afprøvning | **Hobby** (gratis) | Free (gratis, 0,5 GB) |
| Firmaerne bruger det til rigtige kunder | **Pro** (ca. 20 USD/md.) – Hobby må ikke bruges kommercielt | Free er nok i starten; opgradér når data vokser |

Skift fra Hobby til Pro sker med et klik under **Settings → Billing** i Vercel. Intet andet skal ændres.

> **GDPR:** Når der kommer rigtige kundedata i CRM'et, så vælg EU-regioner (se nedenfor), og accepter databehandleraftalerne (DPA) hos Vercel og Neon.

## 1. Opret projektet på Vercel

1. Gå til [vercel.com](https://vercel.com), og vælg **Sign Up → Continue with GitHub**. Vælg planen **Hobby**.
2. Klik **Add New… → Project**, og importér repo'et `thewestmuststayalive/crm`. Giv Vercel adgang til repo'et, hvis du bliver spurgt.
3. Rør ikke ved indstillingerne – klik **Deploy**. Første deploy lykkes, men appen virker først, når databasen er koblet på (næste trin).

## 2. Kobl databasen på (Neon, direkte fra Vercel)

1. Åbn projektet i Vercel, og gå til fanen **Storage**.
2. Klik **Create Database**, og vælg **Neon** (Serverless Postgres). Vælg planen **Free** og regionen **Frankfurt (eu-central-1)**.
3. Klik **Connect** og vælg alle miljøer (Production, Preview, Development). Vercel opretter selv `DATABASE_URL` m.m. – du skal ikke kopiere noget.
4. Gå til fanen **Deployments**, klik på de tre prikker ved den nyeste, og vælg **Redeploy**. Nu oprettes databasetabellerne automatisk.

> Står der ikke `DATABASE_URL` under **Settings → Environment Variables** efter trin 3, så kopiér forbindelsesadressen fra Neon og opret variablen selv.

## 3. Region (anbefalet)

Under **Settings → Functions → Function Region** vælges **Frankfurt (fra1)**, så programmet ligger tæt på databasen. Deploy igen bagefter.

## 4. Første login

1. Åbn adressen Vercel har givet projektet (fx `https://crm-xxxx.vercel.app/registrer`), og opret dig selv. Den første bruger bliver ejer, og derefter lukkes for nye oprettelser.
2. Opret dine øvrige firmaer under **Indstillinger → Firma**.
3. Tilføj medarbejdere under **Indstillinger → Medlemmer**.

## 5. Senere: eget domæne og Meta

Disse trin kan vente, til du har brug for dem.

**Eget domæne:** Under **Settings → Domains** tilføjes fx `crm.ditfirma.dk`; følg Vercels vejledning til DNS. Sæt derefter `APP_URL` (se tabellen) og deploy igen.

**Miljøvariabler** (Settings → Environment Variables):

| Variabel | Hvornår | Værdi |
| -------- | ------- | ----- |
| `DATABASE_URL` | Altid | Sættes automatisk af Neon-koblingen |
| `APP_URL` | Når du har eget domæne | Fx `https://crm.ditfirma.dk` |
| `ENCRYPTION_KEY` | Før Facebook kobles på | 32 tilfældige bytes i base64, fx fra `openssl rand -base64 32`. **Gem den sikkert – mister du den, skal Facebook forbindes igen.** |
| `CRON_SECRET` | Før Facebook kobles på | En lang tilfældig tekst |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Før Facebook kobles på | Se [meta-opsaetning.md](./meta-opsaetning.md) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Når I vil have invitationer og "glemt adgangskode" på e-mail | Opret en gratis konto på [resend.com](https://resend.com), bekræft jeres domæne, og lav en API-nøgle. `EMAIL_FROM` fx `Kundespor <noreply@ditfirma.dk>` |

Efter ændringer i miljøvariabler skal der altid deployes igen (Deployments → Redeploy).

## Databaseændringer og testversioner

Databasen opdateres (migreres) automatisk, når `main` deployes til den rigtige side. Vercels testversioner af pull requests (previews) migrerer **ikke**, fordi de deler database med den rigtige side. En testversion kan derfor vise fejl på sider, der kræver nye databasefelter – det er forventet og påvirker ikke den rigtige side.

## 6. Automatik

- **Hver morgen** (Vercel Cron, `vercel.json` → `/api/cron/daily`) kører Kundespor de automatiske opfølgningsregler, henter annoncedata fra Meta, sender planlagte anmodninger om anmeldelse, sletter gamle leads (kun i firmaer, der har slået det til under Indstillinger → Persondata) og sender den daglige oversigt på e-mail. Det virker også på Hobby. Kræver at `CRON_SECRET` er sat.
- **Sundhedstjek:** `/api/health` svarer `{"ok":true}`, når appen kører. Kan bruges til overvågning (fx UptimeRobot).

## 7. Backup

Neon tager automatisk backup og kan gendanne data fra de seneste dage (længere historik på betalte planer). Til ekstra sikkerhed kan kontakter eksporteres som CSV fra **Kunder → Eksportér CSV**.

## Fejlfinding

| Problem | Løsning |
| ------- | ------- |
| Siden viser en fejl lige efter første deploy | Databasen er ikke koblet på endnu – følg trin 2 og redeploy. |
| "Meta er ikke sat op endnu" | `META_*` og `ENCRYPTION_KEY` mangler. Tilføj dem og redeploy. |
| Kontaktformularen virker ikke på hjemmesiden | Tjek at `APP_URL` er den rigtige adresse, og kopiér koden igen fra **Indstillinger → Kontaktformular**. |
| Login siger "For mange forkerte forsøg" | Vent 15 minutter. Blokeringen ophører af sig selv. |
