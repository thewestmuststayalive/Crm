import { createServer, type Server } from "node:http";

// Falske udgaver af eksterne tjenester, så alt kan testes uden rigtige nøgler:
// Metas Graph API (META_GRAPH_URL/META_OAUTH_URL), Resend til e-mail (RESEND_API_URL)
// CVR-opslag (CVR_API_URL), Google Places (GOOGLE_PLACES_URL), CVR-søgning (CVR_ES_URL)
// og to små hjemmesider til hjemmeside-tjekket (/site/old og /site/modern).

export const META_MOCK_PORT = 3999;
export const META_MOCK_URL = `http://localhost:${META_MOCK_PORT}`;

type Logged = { method: string; path: string; query: Record<string, string>; body: unknown };

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export function startMetaMock(): Promise<Server> {
  const log: Logged[] = [];
  let outCounter = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", META_MOCK_URL);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : null;
    const query = Object.fromEntries(url.searchParams);
    const path = url.pathname.replace(/^\/v[\d.]+/, "");
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (path === "/__requests") return send(200, log);
    log.push({ method: req.method ?? "GET", path, query, body });

    // Kald med et token skal have appsecret_proof (sikkerhedskrav i appen).
    if (query.access_token && !query.appsecret_proof) return send(400, { error: { message: "missing proof" } });

    const key = `${req.method} ${path}`;
    switch (key) {
      case "GET /dialog/oauth": {
        res.writeHead(302, { Location: `${query.redirect_uri}?code=testcode&state=${query.state}` });
        return res.end();
      }
      case "GET /oauth/access_token":
        return query.fb_exchange_token
          ? send(200, { access_token: "long-user-token", expires_in: 5_184_000 })
          : send(200, { access_token: "short-user-token", expires_in: 3600 });
      case "GET /me":
        return send(200, { id: "fbuser1", name: "Test Admin" });
      case "GET /me/accounts":
        return send(200, {
          data: [
            {
              id: "PAGE1",
              name: "Testsiden",
              access_token: "page-token-1",
              instagram_business_account: { id: "IG1", username: "testsiden" },
            },
          ],
        });
      case "GET /me/adaccounts":
        return send(200, { data: [{ id: "act_555", account_id: "555", name: "Testkonto", currency: "DKK" }] });
      case "POST /PAGE1/subscribed_apps":
      case "DELETE /PAGE1/subscribed_apps":
        return send(200, { success: true });
      case "GET /act_555/insights":
        return send(200, {
          data: [
            { campaign_id: "C1", campaign_name: "Vinterkampagne", date_start: daysAgo(1), spend: "500.00", impressions: "10000", clicks: "300", actions: [{ action_type: "lead", value: "2" }] },
            { campaign_id: "C1", campaign_name: "Vinterkampagne", date_start: daysAgo(2), spend: "250.50", impressions: "5000", clicks: "120" },
          ],
        });
      case "GET /PAGE1/conversations":
        if (query.platform === "instagram") return send(200, { data: [] });
        return send(200, {
          data: [
            {
              id: "t_old",
              participants: { data: [{ id: "PAGE1", name: "Testsiden" }, { id: "PSID_OLD", name: "Gammel Kunde" }] },
              messages: {
                data: [
                  { id: "m_old_2", message: "Svar fra siden", created_time: new Date(Date.now() - 3 * 86_400_000 + 60_000).toISOString(), from: { id: "PAGE1" } },
                  { id: "m_old_1", message: "Hej, hvad koster det?", created_time: new Date(Date.now() - 3 * 86_400_000).toISOString(), from: { id: "PSID_OLD" } },
                ],
              },
            },
          ],
        });
      case "GET /LEAD123":
        return send(200, {
          id: "LEAD123",
          field_data: [
            { name: "full_name", values: ["Maja Meta"] },
            { name: "email", values: ["maja@example.com"] },
            { name: "phone_number", values: ["+4512345678"] },
            { name: "hvornår_vil_du_starte?", values: ["Hurtigst muligt"] },
          ],
          campaign_id: "C1",
          campaign_name: "Vinterkampagne",
          ad_name: "Annonce A",
          form_id: "F1",
        });
      case "GET /PSID_NEW":
        return send(200, { first_name: "Mads", last_name: "Messenger" });
      case "GET /IGSID_NEW":
        return send(200, { name: "Ida Insta", username: "ida" });
      case "GET /api": {
        // Falsk CVR-register (cvrapi.dk-format)
        const q = query.vat ?? query.name ?? "";
        if (q === "12345678" || q.toLowerCase().includes("testfirma")) {
          return send(200, {
            vat: 12345678, name: "TESTFIRMA ApS", address: "Testvej 1", zipcode: "8000", city: "Aarhus C",
            phone: "70707070", email: "info@testfirma.dk", industrydesc: "Konsulentbistand", protected: true,
          });
        }
        return send(404, { error: "NOT_FOUND" });
      }
      case "POST /places:searchText": {
        // Falsk Google Places (New) Text Search
        if (req.headers["x-goog-api-key"] !== "test-google") return send(403, { error: { message: "bad key" } });
        if (!String(req.headers["x-goog-fieldmask"] ?? "").includes("places.nationalPhoneNumber")) {
          return send(400, { error: { message: "missing field mask" } });
        }
        if (body?.pageToken === "PAGE2") {
          return send(200, {
            places: [
              {
                id: "place-3", displayName: { text: "Hår & Co" }, formattedAddress: "Søgade 3, 8000 Aarhus C, Danmark",
                nationalPhoneNumber: "86 33 33 33", websiteUri: `${META_MOCK_URL}/site/modern`, rating: 4.9,
                userRatingCount: 310, businessStatus: "OPERATIONAL", primaryTypeDisplayName: { text: "Frisør" },
              },
            ],
          });
        }
        return send(200, {
          places: [
            {
              id: "place-1", displayName: { text: "Salon Klip" }, formattedAddress: "Klipgade 1, 8000 Aarhus C, Danmark",
              nationalPhoneNumber: "86 12 34 56", websiteUri: `${META_MOCK_URL}/site/old`, rating: 4.6,
              userRatingCount: 120, googleMapsUri: "https://maps.google.com/?cid=1", businessStatus: "OPERATIONAL",
              primaryTypeDisplayName: { text: "Frisør" },
            },
            {
              id: "place-2", displayName: { text: "Frisør Uden Side" }, formattedAddress: "Torvet 2, 8000 Aarhus C, Danmark",
              nationalPhoneNumber: "86 22 22 22", rating: 4.1, userRatingCount: 12, businessStatus: "OPERATIONAL",
            },
            {
              id: "place-closed", displayName: { text: "Lukket Salon" }, businessStatus: "CLOSED_PERMANENTLY",
            },
          ],
          nextPageToken: "PAGE2",
        });
      }
      case "POST /cvr-permanent/virksomhed/_search": {
        // Falsk CVR-søgning (Erhvervsstyrelsens Elasticsearch)
        const expected = `Basic ${Buffer.from("test-cvr:test-pass").toString("base64")}`;
        if (req.headers.authorization !== expected) return send(401, { error: "unauthorized" });
        const meta = (navn: string, extra: Record<string, unknown> = {}) => ({
          nyesteNavn: { navn },
          nyesteBeliggenhedsadresse: { vejnavn: "Nygade", husnummerFra: 5, postnummer: 8000, postdistrikt: "Aarhus C" },
          nyesteHovedbranche: { branchekode: "960210", branchetekst: "Frisører" },
          nyesteVirksomhedsform: { kortBeskrivelse: "ApS" },
          nyesteMaanedsbeskaeftigelse: { intervalKodeAntalAnsatte: "ANTAL_2_4" },
          stiftelsesDato: daysAgo(20),
          sammensatStatus: "NORMAL",
          ...extra,
        });
        return send(200, {
          hits: {
            total: 2,
            hits: [
              {
                _source: {
                  Vrvirksomhed: {
                    cvrNummer: 44556677,
                    reklamebeskyttet: false,
                    telefonNummer: [{ kontaktoplysning: "40404040", hemmelig: false, periode: { gyldigTil: null } }],
                    hjemmeside: [],
                    virksomhedMetadata: meta("Nyt Hår ApS"),
                  },
                },
              },
              {
                // Reklamebeskyttet: må aldrig vises, selv hvis registret skulle returnere det.
                _source: {
                  Vrvirksomhed: { cvrNummer: 11223344, reklamebeskyttet: true, virksomhedMetadata: meta("Beskyttet Frisør ApS") },
                },
              },
            ],
          },
        });
      }
      case "GET /site/old":
      case "GET /site/modern": {
        const modern = path === "/site/modern";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(
          modern
            ? `<!doctype html><html><head><title>Hår & Co</title><meta name="viewport" content="width=device-width, initial-scale=1">
               <meta name="description" content="Frisør i Aarhus med online booking">
               <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
               <script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script></head>
               <body><a href="/book">Book tid</a><footer>© ${new Date().getFullYear()} Hår & Co</footer></body></html>`
            : `<html><head><title>Salon Klip</title></head><body><p>Velkommen</p><footer>Copyright 2016 Salon Klip</footer></body></html>`,
        );
      }
      case "POST /emails":
        return send(200, { id: `email_${log.length}` });
      case "POST /PAGE1/messages":
        outCounter++;
        return send(200, { recipient_id: body?.recipient?.id, message_id: `m_out_${outCounter}` });
      default:
        return send(404, { error: { message: `Mock kender ikke ${key}` } });
    }
  });

  return new Promise((resolve) => server.listen(META_MOCK_PORT, () => resolve(server)));
}
