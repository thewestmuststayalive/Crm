# Kundespor – brandguide

**Kundespor** er det danske CRM, der samler alle kundehenvendelser og sørger for, at ingen kunde bliver glemt.

**Slogan:** *Alle kunder samlet. Ingen glemt.*

## Idé

Hver kunde efterlader et spor: en besked på Instagram, en formular på hjemmesiden, et opkald eller et tilbud. Kundespor samler sporet ét sted, så du kan følge det fra første "hej" til betalt faktura.

## Logo

- **Symbolet** viser et spor fra første kontakt (hvid prik) til kunden (gylden prik) på en sporgrøn flade med runde hjørner. Filer: `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icon-512.png`. I koden bruges `<Logo />` / `<LogoMark />` fra `src/components/brand.tsx`.
- **Ordmærket** er "Kundespor" i Plus Jakarta Sans, fed. Det står altid i ét ord og med stort K.
- Brug den lyse udgave (`tone="light"`) på mørk baggrund.
- Logoet må ikke strækkes, roteres eller gives skygge.

## Farver

| Navn | Hex | Brug |
| ---- | --- | ---- |
| Sporgrøn 700 | `#1b6257` | Primære knapper, logo, aktive elementer |
| Sporgrøn 950 | `#0a2622` | Menu og mørke flader |
| Sporgrøn 50 | `#eefaf6` | Lyse fremhævninger |
| Guld 400 | `#f5b94a` | Accent: målet, notifikationer. Bruges sparsomt. |
| Baggrund | `#f5f7f6` | Sidebaggrund |
| Tekst | `#111827` | Brødtekst |

Hele skalaen (50–950) ligger i `src/app/globals.css` som `brand-*` og `accent-*`. Tekst på guld er altid mørk (`brand-950`) af hensyn til kontrasten.

## Skrift

- **Overskrifter:** Plus Jakarta Sans (variabel)
- **Brødtekst og tal:** Inter (variabel)

Begge er selvhostede (`@fontsource-variable/*`), så ingen data sendes til Google.

## Tone

| Gør | Undgå |
| --- | ----- |
| "3 kunder venter på svar" | "Du har 3 ubehandlede leads i køen" |
| "Ring tilbage til Karen i dag" | "Opfølgningsaktivitet forfalden" |
| "du" | "De", fagudtryk, engelske buzzwords |
| Korte sætninger, konkrete tal | Udråbstegn og overdrevne løfter |

Tonen er varm, rolig og direkte: Kundespor holder styr på tingene, så du kan fokusere på kunden.
