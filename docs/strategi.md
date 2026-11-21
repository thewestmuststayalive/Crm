# Strategi: brand, positionering og næste funktioner

*Udkast til godkendelse · november 2026*

**Rammer (besluttet):** CRM'et bruges i egne firmaer (sælges ikke). Målgruppen er danske små virksomheder med 1–50 ansatte, der får kunder via Facebook/Instagram, hjemmeside og telefon.

---

## 1. Konkurrenterne – kort fortalt

| Produkt | Styrke | Svaghed for en dansk småvirksomhed | Pris (vejledende, 2026) |
| ------- | ------ | ---------------------------------- | ----------------------- |
| **HubSpot** | Gratis start, stort økosystem | Automatisering, flere pipelines og AI kræver betalte planer; stort prisspring til Professional | Gratis → Starter ca. 15–20 USD/bruger/md → Professional flere hundrede USD/md |
| **Pipedrive** | Enkel, god pipeline | Ingen gratis plan; opkald, automatisering og AI er tilkøb | ca. 14–99 USD/bruger/md |
| **Kommo** | Stærk på Messenger/Instagram/WhatsApp-indbakke | Ikke dansk, ingen CVR/dansk regnskab; prisstigning i 2026 | ca. 15–25 USD → stiger til 25–35 USD/bruger/md |
| **Trengo** | Samlet indbakke for mange kanaler | Indbakke frem for salg/pipeline; AI koster ekstra | Boost ca. 299 EUR/md |
| **Lime / SuperOffice / Upsales** | Nordiske, dansk sprog, B2B | Tunge og dyre for små virksomheder | Lime fra ca. 400 kr./bruger/md; Upsales fra ca. 499 SEK/md |
| **Zoho, monday, Zendesk Sell** | Mange funktioner, billige | Engelsk-første, generiske, kræver opsætning | ca. 9–35 USD/bruger/md |

**Hvad brugerne klager over (gennemgående):** for komplekst, for meget manuel indtastning, data der ikke bliver opdateret, og for mange separate værktøjer (indbakke, SMS, telefon og CRM hver for sig).

## 2. Hullet vi kan udfylde

Ingen af de store kombinerer de her ting for en dansk småvirksomhed:

1. **Alle henvendelser ét sted** – Messenger, Instagram, hjemmeside, Lead Ads (og senere e-mail/SMS) i samme indbakke og samme kundekort. *(Vi har grundlaget allerede.)*
2. **Annoncekroner → vundne kroner** – forbrug pr. kampagne koblet direkte til vundne deals. De store kræver dyre planer eller tilkøb for det.
3. **"Ingen kunde glemmes"** – svartid måles, ubesvarede henvendelser fremhæves, og opfølgning oprettes automatisk.
4. **Dansk fra bunden** – CVR-opslag, kroner og moms, dansk sprog og (senere) e-conomic/Dinero/Billy.
5. **Flere firmaer under ét login** – sjældent hos konkurrenterne, hvor hvert firma typisk kræver sin egen konto. *(Vi har det allerede.)*
6. **AI på dansk** – svarforslag til beskeder, opsummering af kunden og udtræk af kontaktinfo fra beskeder.

**Positionering (forslag):** *Det danske CRM, der samler alle kundehenvendelser og sørger for, at ingen kunde bliver glemt.*

## 3. Brand

### Navneforslag

Domæner er tjekket via DNS/RDAP (nov. 2026). ".dk ledig" skal bekræftes hos Punktum dk før køb, og navnet bør tjekkes for varemærker hos DKPTO.

| Navn | Betydning / idé | .dk | .com |
| ---- | --------------- | ------------ | ---- |
| **Kundespor** | Følg hvert spor fra første besked til betalt faktura | sandsynligvis ledig | ledig |
| **Kundekreds** | Klassisk dansk ord for "kunderne"; tillidsvækkende og varmt | sandsynligvis ledig | ledig |
| **Hejkunden** | "Hej" er sådan kunder starter en besked; venligt og beskedfokuseret | sandsynligvis ledig | ledig |
| **Kundenær** (kundenaer) | Tæt på kunden | sandsynligvis ledig | ledig |
| **Gnist** (gnistcrm) | Energi, den gnist der starter en kunderelation | sandsynligvis ledig | ledig |

**Anbefaling:** *Kundespor*. Det beskriver præcis, hvad systemet gør, og navnet er let at sige og stave. Det fungerer også visuelt som en linje eller et spor i logoet.

### Personlighed og tone

- **Varm, direkte og dansk:** "du" frem for "De", korte sætninger, ingen buzzwords.
- **Rolig:** systemet holder styr på tingene, så du ikke skal.
- **Eksempel:** "3 kunder venter på svar" frem for "Du har 3 ubehandlede leads i køen".

### Visuel identitet (leverancer)

- Logo (ordmærke + lille symbol), app-ikon og favicon
- Farvepalet (rolig mørkegrøn/blågrøn som hovedfarve + varm accentfarve), skrifttype, ikoner
- Login-side, tomme tilstande ("Ingen samtaler endnu …") og velkomstguide i brandets stemme
- Mørk tilstand
- Kort brandguide (én side) til fremtidige materialer

## 4. Nye funktioner – foreslået rækkefølge

**Fase A – "Ingen kunde glemmes"** *(størst værdi, lav pris)*
- **Venter på svar:** liste og svartidsmåling; advarsel når en henvendelse har ventet for længe
- **Notifikationer:** besked i browser/telefon ved nyt lead eller ny besked, plus daglig e-mail-oversigt
- **Automatiske opfølgningsregler:** fx "lead uden aktivitet i 2 dage → opgave til den ansvarlige"
- **E-mails fra systemet:** invitationer til medarbejdere, glemt adgangskode, notifikationer
- **CVR-opslag:** skriv CVR, og virksomhedens navn og adresse udfyldes automatisk
- **Import af kunder** fra Excel/CSV

**Fase B – Fra lead til betaling**
- Tilbud med varelinjer og moms, sendt som link/PDF, som kunden accepterer online → dealen vindes automatisk
- Produkt- og prisliste
- Integration til **e-conomic** (gratis API, kræver CVR) – senere Dinero/Billy

**Fase C – AI-assistent på dansk**
- Svarforslag i indbakken (du godkender altid, før der sendes)
- "Opsummér kunden" og forslag til næste skridt
- Udtræk af navn, telefon og behov fra beskeder til kundekortet

**Fase D – Flere kanaler og mobil**
- Installérbar app på telefonen (PWA) med push-notifikationer
- E-mail-indbakke (Gmail/Outlook) på kundekortet
- SMS (dansk udbyder) til påmindelser og opfølgning
- Mødebooking koblet til kalenderen

**Brandet** bygges ind i appen parallelt med fase A.

### Løbende omkostninger, du skal kende

| Funktion | Udbyder (forslag) | Omkostning |
| -------- | ----------------- | ---------- |
| E-mails fra systemet | Resend eller Postmark (EU) | Gratis niveau dækker typisk et lille firma |
| CVR-opslag | Datafordeler (officiel, gratis nøgle) eller kommerciel CVR-API | Gratis/lav |
| AI | Claude API | Betaling pr. brug; typisk få kroner pr. dag for et lille team |
| SMS | Dansk SMS-gateway | Pr. besked |
| e-conomic | e-conomic API | Gratis (kræver CVR) |

## 5. Beslutninger

1. **Navn:** Kundespor ✔
2. **Rækkefølge:** brand + fase A først ✔ (færdig, nov. 2026)
3. **e-conomic:** udskudt til senere.

## 6. Hvad konkurrenterne har, som Kundespor mangler (nov. 2026)

| # | Funktion | Hvem har det | Kundesporets bud | Indsats |
| - | -------- | ------------ | ---------------- | ------- |
| 1 | **Egne felter og egne pipeline-faser / flere pipelines** ✔ | Alle (Pipedrive, HubSpot Starter, Bigin, Zoho) | Pr. firma, så hvert firma kan have sin egen salgsproces | Mellem |
| 2 | **Tilbud med online accept og underskrift** ✔ | Pipedrive Smart Docs, HubSpot quotes | Pænt tilbud som link, kunden accepterer med navn → deal vundet | Mellem |
| 3 | **E-mail på kundekortet** (sende, modtage, skabeloner, åbningssporing) | HubSpot (gratis), Pipedrive, Bigin | Send fra Kundespor; svar lander via en unik svar-adresse – ingen tung Google-godkendelse | Stor |
| 4 | **Mødebooking-link** | HubSpot, Pipedrive Scheduler | Kunden booker selv tid; mødet lander på kundekortet | Mellem |
| 5 | **Chat-widget på hjemmesiden** | HubSpot live chat, Pipedrive LeadBooster | Chatten lander i den samme indbakke som Messenger/Instagram | Mellem |
| 6 | **AI-assistent** (næste skridt, svarforslag, opsummering) | Pipedrive AI Sales Assistant/Nova, Kommo AI agent, Zoho Zia | På dansk; du godkender altid før afsendelse | Mellem |
| 7 | **Mobil-app med push** | Alle | Installérbar app (PWA) med push-notifikationer | Lille–mellem |
| 8 | **Anmeldelser efter salg** (Google/Trustpilot) ✔ | Keap, Podium; HubSpot via Trustpilot-integration | Automatisk invitation, når en deal vindes | Lille |
| 9 | **GDPR-værktøjer** (indsigt, sletning, samtykke, automatisk oprydning) ✔ | Delvist hos de store | Ét klik: eksportér/slet en persons data; samtykke-felt | Lille |
| 10 | **Masseudsendelse** (nyhedsbrev/SMS til et segment) | Kommo broadcasts, Pipedrive Campaigns | Kun til kontakter med samtykke | Mellem |
| 11 | **API, webhooks og Zapier** | Alle | Forbind Kundespor med alt andet | Mellem |
| 12 | **Salgsmål og prognose** | Pipedrive goals, HubSpot forecasts | Mål pr. firma og pr. medarbejder | Lille–mellem |
| 13 | **Filer på kundekortet** | Alle | Vedhæft kontrakter, billeder, tilbud | Lille |
| 14 | **Telefoni** (ring fra CRM, optag) | Bigin, Pipedrive | Senere – kræver telefoniudbyder | Stor |

**Det har vi, som de ikke har:** flere firmaer under ét login, "Venter på svar" med målt svartid, annoncekroner koblet til vundne kroner, CVR-opslag med reklamebeskyttelse, alt på dansk.

**Fase B (færdig, nov. 2026):** 1 (egne felter + pipelines), 2 (tilbud), 8 (anmeldelser) og 9 (GDPR). ✔ markerer det, der er bygget.

**Forslag til næste pakke:** 7 (mobil-app med push), 3 (e-mail på kundekortet) og 6 (AI-assistent).

---

### Kilder

- [10 CRM-systemer til små virksomheder i 2026 – The CX Lead](https://thecxlead.com/da/tools/bedste-crm-til-smaa-virksomheder-2/)
- [Zendesk: CRM til små virksomheder](https://www.zendesk.com/dk/sell/crm/small-business/)
- [Kommo prisændringer 2026 (Kommo blog)](https://www.kommo.com/blog/amocrm-pricing/) · [Kommo planer (support)](https://support.kommo.com/docs/kommo-subscription-plans-overview) · [Kommo på G2](https://www.g2.com/products/kommo/pricing)
- [HubSpot-begrænsninger (Close)](https://close.com/blog/hubspot-crm-limitations) · [HubSpot-priser 2026 (EngageBay)](https://www.engagebay.com/blog/hubspot-pricing/) · [HubSpot feature gating (LowCode Agency)](https://www.lowcode.agency/blog/hubspot-feature-gating-smbs)
- [Pipedrive-priser 2026 (Zeeg)](https://zeeg.me/post/pipedrive-pricing) · [Pipedrive på Capterra](https://www.capterra.com/p/132666/Pipedrive/pricing/) · [Pipedrive pricing atlas (Orb)](https://www.withorb.com/pricing-atlas/pipedrive)
- [Trengo-priser](https://www.trengo.com/pricing) · [Trengo-alternativer (SleekFlow)](https://sleekflow.io/blog/trengo-alternatives)
- [Lime CRM priser (dansk)](https://www.lime-technologies.com/da/pris) · [Upsales (businesswith.se)](https://businesswith.se/system/upsales/)
- [CRM-problemer for små virksomheder (Nutshell)](https://www.nutshell.com/blog/crm-issues-and-how-to-address-them) · [Fragmenterede værktøjer (SeoSamba)](https://www.seosamba.com/seoblog/why-most-crms-fail-small-businesses-and-what-a-modern-crm-should-actually-deliver-1772710094403.html)
- [AI i CRM (Capterra)](https://capterra.com/resources/crm-software-with-ai-features-guide) · [Bedste AI-CRM 2026 (Nutshell)](https://www.nutshell.com/pt/blog/best-ai-crms)
- [e-conomic API (Apideck)](https://www.apideck.com/blog/how-to-integrate-with-the-e-conomic-api) · [HubSpot–e-conomic integration](https://ecosystem.hubspot.com/marketplace/apps/hubspot-to-economic-622089)
- [CVR hos Erhvervsstyrelsen](https://erhvervsstyrelsen.dk/hent-oplysninger-fra-cvr)
- [HubSpot gratis CRM](https://hubspot.com/products/crm/free) · [Bedste gratis CRM 2026 (TechRadar)](https://www.techradar.com/best/best-free-crm-software)
- [Pipedrive-funktioner 2026 (ZoomInfo)](https://pipeline.zoominfo.com/sales/pipedrive-features) · [Pipedrive produktopdateringer](https://www.pipedrive.com/en/product-updates) · [Pipedrive salgsdokumenter](https://support.pipedrive.com/en/category/features/sales-documents)
- [Kommo broadcasts](https://www.kommo.com/blog/broadcast-message/) · [Kommo-opdateringer](https://www.kommo.com/blog/kommo-update/)
- [Bigin by Zoho – funktioner](https://www.bigin.com/features/) · [Bigin Q1 2026](https://www.zoho.com/blog/bigin/q1_2026.html) · [Bigin AI](https://www.zoho.com/blog/bigin/meet-new-ai-features.html)
- [Vigtigste CRM-funktioner for små virksomheder (Nutshell)](https://www.nutshell.com/?p=1830) · [G2: funktioner brugerne værdsætter](https://learn.g2.com/crm-software-features)
- [Anmeldelser efter salg (Salesforce)](https://www.salesforce.com/blog/get-reviews-for-your-small-business/) · [Trustpilot–HubSpot](https://business.trustpilot.com/partners/integrations/partner/hubspot)

*Priser er indsamlet fra tredjepartskilder og leverandørsider i 2026 og kan have ændret sig.*
