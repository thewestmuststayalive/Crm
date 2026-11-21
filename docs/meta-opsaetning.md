# Opsætning af Facebook og Instagram (Meta)

CRM'et bruger Metas officielle API'er til tre ting:

1. **Lead Ads** – leads fra dine annonceformularer på Facebook og Instagram oprettes automatisk som kontakt, deal og opfølgningsopgave.
2. **Annonceforbrug** – forbrug pr. kampagne hentes dagligt, så du kan se pris pr. lead og afkast.
3. **Indbakke** – beskeder fra Messenger og Instagram Direct samles i CRM'et, og du kan svare derfra.

Det kræver en **Meta-app**, som du opretter én gang. Den samme app bruges til alle dine firmaer.

## Det skal du have klar

- En Facebook-profil, der er administrator af firmaernes Facebook-sider og annoncekonti
- En **Meta Business-konto** (business.facebook.com) med siderne og annoncekontiene
- Instagram-konti skal være **Business- eller Creator-konti** og forbundet til en Facebook-side
- CRM'et skal køre på sin endelige adresse (se [drift.md](./drift.md)), fx `https://crm.ditfirma.dk`

## Trin 1: Opret appen

1. Gå til [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**.
2. Vælg at appen er til **erhverv (Business)**, og knyt den til din Meta Business-konto.
3. Under **App settings → Basic**: notér **App ID** og **App Secret**. Udfyld privatlivspolitik-URL og kategori (kræves senere).

## Trin 2: Tilføj produkterne

Tilføj disse produkter til appen:

- **Facebook Login for Business** – under *Settings* sættes **Valid OAuth Redirect URIs** til `https://crm.ditfirma.dk/api/meta/callback`
- **Webhooks**
- **Messenger**
- **Instagram** (Instagram API med Facebook Login)
- **Marketing API**

## Trin 3: Webhooks

1. Vælg en hemmelig tekst som *verify token* (fx en lang tilfældig tekst). Den skal stå i `META_VERIFY_TOKEN` på serveren.
2. Under **Webhooks**, objektet **Page**: Callback-URL `https://crm.ditfirma.dk/api/meta/webhook` og dit verify token. Abonnér på felterne `leadgen`, `messages`, `messaging_postbacks` og `message_echoes`.
3. Objektet **Instagram**: samme callback-URL og verify token. Abonnér på `messages`.

Callback-URL'en kan også kopieres i CRM'et under **Indstillinger → Facebook & Instagram**.

## Trin 4: Nøgler på serveren

Indsæt i Vercel (Settings → Environment Variables) og deploy igen:

| Variabel | Værdi |
| -------- | ----- |
| `META_APP_ID` | App ID |
| `META_APP_SECRET` | App Secret |
| `META_VERIFY_TOKEN` | Dit verify token fra trin 3 |
| `ENCRYPTION_KEY` | Se drift.md (bruges til at kryptere adgangstokens) |

## Trin 5: Forbind i CRM'et

1. Log ind som administrator, vælg firmaet, og gå til **Indstillinger → Facebook & Instagram**.
2. Klik **Forbind med Facebook**, og giv alle tilladelser.
3. Klik **Kobl til** ud for den side og annoncekonto, der hører til firmaet. Skift firma, og gentag for dine andre firmaer.
4. Vælg hvem nye leads tildeles.

For Lead Ads skal appen også have adgang til leads i Meta Business Suite: **Indstillinger → Integrationer → Leads-adgang** (Leads Access), hvor appen tilføjes som CRM.

## Trin 6: Test før godkendelse

Mens appen er i **udviklingstilstand**, virker alt for personer med en rolle i appen (dig selv og evt. testere):

- **Lead Ads:** brug Metas [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing) til at sende et testlead. Det dukker op under Kunder.
- **Messenger/Instagram:** skriv til din side fra en profil, der har en rolle i appen. Beskeden dukker op i Indbakken.
- **Annoncer:** forbrug kan hentes fra dine egne annoncekonti med det samme.

## Trin 7: Metas godkendelse (App Review)

For at modtage leads og beskeder fra **rigtige kunder** skal appen i **Live**-tilstand og have **Advanced Access** til disse tilladelser:

`pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `leads_retrieval`, `instagram_basic`, `instagram_manage_messages`, `ads_read`, `business_management`

Meta kræver:

- **Virksomhedsverificering** (Business Verification) af din Meta Business-konto – CVR-dokumentation m.m.
- En kort **skærmoptagelse** pr. tilladelse, der viser hvordan CRM'et bruger den (fx: et lead dukker op under Kunder; du svarer på en besked i Indbakken).
- En beskrivelse af formålet: *"Internt CRM for vores egne virksomheder. Leads fra vores Lead Ads og beskeder til vores sider vises for vores medarbejdere, som besvarer dem."*

Godkendelsen tager typisk fra få dage til et par uger. Den kan ikke fremskyndes.

## Begrænsninger fra Meta

- **24-timersreglen:** du kan kun svare frit inden for 24 timer efter kundens seneste besked. Derefter er svarfeltet lukket i CRM'et, og du må svare fra Meta Business Suite eller vente til kunden skriver igen.
- **Adgangen udløber** efter ca. 60 dage uden brug. CRM'et viser udløbsdatoen; klik **Forbind igen** for at forny.
- En Facebook-side og en annoncekonto kan kun høre til **ét** firma i CRM'et.
