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

// ---------------------------------------------------------------------------
// Falsk e-conomic REST API (samme svarformat som restapi.e-conomic.com)
// ---------------------------------------------------------------------------

type EcoCustomer = { customerNumber: number; name: string; corporateIdentificationNumber?: string; email?: string };
type EcoDraft = { draftInvoiceNumber: number; netAmount: number; vatAmount: number; grossAmount: number; body: Record<string, unknown> };
type EcoBooked = { bookedInvoiceNumber: number; date: string; dueDate: string; netAmount: number; vatAmount: number; grossAmount: number; remainder: number };

const eco = {
  customers: [{ customerNumber: 1, name: "Eksisterende Kunde A/S", corporateIdentificationNumber: "11112222" }] as EcoCustomer[],
  drafts: new Map<number, EcoDraft>(),
  booked: new Map<number, EcoBooked>(),
  nextDraft: 1,
  nextBooked: 1001,
};

function economic(
  method: string,
  url: URL,
  body: Record<string, unknown> | null,
  headers: import("node:http").IncomingHttpHeaders,
  res: import("node:http").ServerResponse,
) {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const path = url.pathname.replace("/economic-api", "");
  // Testhjælp: markér en bogført faktura som betalt.
  if (path === "/__pay") {
    const b = eco.booked.get(Number(url.searchParams.get("n")));
    if (b) b.remainder = 0;
    return send(200, { ok: Boolean(b) });
  }
  if (headers["x-appsecrettoken"] !== "test-economic-secret") return send(401, { message: "bad app token" });
  const grant = headers["x-agreementgranttoken"];
  if (grant !== "grant-plus" && grant !== "grant-basis") return send(401, { message: "bad grant" });
  if (method !== "GET" && grant === "grant-basis") {
    return send(403, { title: "The license is read-only.", status: 403, errorCode: "LicenseIsReadOnly" });
  }
  const coll = (collection: unknown[]) => send(200, { collection, pagination: { results: collection.length } });

  if (method === "GET" && path === "/self") {
    return send(200, {
      agreementNumber: grant === "grant-plus" ? 777001 : 777002,
      agreementType: { agreementTypeNumber: 1, name: "denmark", subscriptionPlanLevel: grant === "grant-plus" ? "plus" : "basis" },
      company: { name: grant === "grant-plus" ? "Testfirma Regnskab ApS" : "Basis Firma ApS", companyIdentificationNumber: "12345678" },
    });
  }
  if (method === "GET" && path === "/layouts") return coll([{ layoutNumber: 21, name: "DK. std. m. bankoplys. 1.8" }]);
  if (method === "GET" && path === "/payment-terms")
    return coll([{ paymentTermsNumber: 1, name: "Netto 8 dage", daysOfCredit: 8 }, { paymentTermsNumber: 2, name: "Løbende måned 30 dage" }]);
  if (method === "GET" && path === "/customer-groups") return coll([{ customerGroupNumber: 1, name: "Diverse" }]);
  if (method === "GET" && path === "/vat-zones")
    return coll([{ vatZoneNumber: 1, name: "Domestic", enabledForCustomer: true }, { vatZoneNumber: 2, name: "EU", enabledForCustomer: true }]);
  if (method === "GET" && path === "/products") {
    if (url.searchParams.get("filter") !== "barred$eq:false") return send(400, { message: "unexpected filter" });
    return coll([{ productNumber: "100", name: "Ydelser", barred: false }]);
  }
  if (method === "GET" && path === "/customers") {
    const m = (url.searchParams.get("filter") ?? "").match(/^corporateIdentificationNumber\$eq:(\d+)$/);
    return coll(eco.customers.filter((c) => m && c.corporateIdentificationNumber === m[1]));
  }
  const customerMatch = path.match(/^\/customers\/(\d+)$/);
  if (method === "GET" && customerMatch) {
    const c = eco.customers.find((x) => x.customerNumber === Number(customerMatch[1]));
    return c ? send(200, c) : send(404, { message: "Customer not found" });
  }
  if (method === "POST" && path === "/customers") {
    for (const k of ["name", "currency", "customerGroup", "paymentTerms", "vatZone"]) {
      if (!body?.[k]) return send(400, { message: `${k} is required` });
    }
    const c = { ...(body as object), customerNumber: Math.max(...eco.customers.map((x) => x.customerNumber)) + 1 } as EcoCustomer;
    eco.customers.push(c);
    return send(201, c);
  }
  if (method === "POST" && path === "/invoices/drafts") {
    for (const k of ["date", "currency", "customer", "paymentTerms", "layout", "recipient"]) {
      if (!body?.[k]) return send(400, { message: `${k} is required` });
    }
    const lines = (body!.lines as { quantity: number; unitNetPrice: number; product?: { productNumber?: string } }[]) ?? [];
    if (lines.some((l) => !l.product?.productNumber)) return send(400, { message: "No identifiers present on product." });
    const net = Math.round(lines.reduce((s2, l) => s2 + l.quantity * l.unitNetPrice, 0) * 100) / 100;
    const vat = Math.round(net * 25) / 100;
    const d: EcoDraft = { draftInvoiceNumber: eco.nextDraft++, netAmount: net, vatAmount: vat, grossAmount: net + vat, body: body! };
    eco.drafts.set(d.draftInvoiceNumber, d);
    return send(201, { draftInvoiceNumber: d.draftInvoiceNumber, netAmount: d.netAmount, vatAmount: d.vatAmount, grossAmount: d.grossAmount });
  }
  if (method === "POST" && path === "/invoices/booked") {
    const n = (body?.draftInvoice as { draftInvoiceNumber?: number })?.draftInvoiceNumber;
    const d = n ? eco.drafts.get(n) : undefined;
    if (!d) return send(404, { message: "Draft invoice not found" });
    eco.drafts.delete(d.draftInvoiceNumber);
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
    const b: EcoBooked = {
      bookedInvoiceNumber: eco.nextBooked++, date: today, dueDate: due,
      netAmount: d.netAmount, vatAmount: d.vatAmount, grossAmount: d.grossAmount, remainder: d.grossAmount,
    };
    eco.booked.set(b.bookedInvoiceNumber, b);
    return send(201, { ...b, pdf: { download: `/invoices/booked/${b.bookedInvoiceNumber}/pdf` } });
  }
  const bookedMatch = path.match(/^\/invoices\/booked\/(\d+)(\/pdf)?$/);
  if (method === "GET" && bookedMatch) {
    const b = eco.booked.get(Number(bookedMatch[1]));
    if (!b) return send(404, { message: "Invoice not found" });
    if (bookedMatch[2]) {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      return res.end(`%PDF-1.4 Faktura ${b.bookedInvoiceNumber}`);
    }
    return send(200, b);
  }
  return send(404, { message: `e-conomic-mock kender ikke ${method} ${path}` });
}

// ---------------------------------------------------------------------------
// Falsk Stripe API (formular-kodede kald, JSON-svar som api.stripe.com)
// ---------------------------------------------------------------------------

type StripeSession = {
  id: string;
  url: string;
  payment_status: string;
  status: string;
  amount_total: number;
  currency: string;
  metadata: Record<string, string>;
  success_url: string;
  customer_email: string | null;
};

export const stripeState = {
  sessions: new Map<string, StripeSession>(),
  webhooks: [] as { id: string; url: string; events: string[] }[],
  counter: 0,
};

function stripe(
  method: string,
  url: URL,
  raw: string,
  headers: import("node:http").IncomingHttpHeaders,
  res: import("node:http").ServerResponse,
) {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (headers.authorization !== "Bearer sk_test_kundespor123456") {
    return send(401, { error: { message: "Invalid API Key provided" } });
  }
  const path = url.pathname.replace("/stripe-api", "");
  const form = new URLSearchParams(raw);
  if (method === "GET" && path === "/v1/account") {
    return send(200, { id: "acct_test", settings: { dashboard: { display_name: "Testfirma Betaling" } } });
  }
  if (method === "POST" && path === "/v1/webhook_endpoints") {
    const hook = { id: `we_test_${++stripeState.counter}`, url: form.get("url") ?? "", events: form.getAll("enabled_events[]") };
    stripeState.webhooks.push(hook);
    return send(200, { id: hook.id, secret: "whsec_test_secret", livemode: false, url: hook.url });
  }
  const hookMatch = path.match(/^\/v1\/webhook_endpoints\/(we_test_\d+)$/);
  if (method === "DELETE" && hookMatch) {
    stripeState.webhooks = stripeState.webhooks.filter((h) => h.id !== hookMatch[1]);
    return send(200, { id: hookMatch[1], deleted: true });
  }
  if (method === "GET" && path === "/v1/__webhooks") return send(200, stripeState.webhooks);
  if (method === "POST" && path === "/v1/checkout/sessions") {
    if (form.get("mode") !== "payment" || form.get("line_items[0][price_data][currency]") !== "dkk") {
      return send(400, { error: { message: "bad params" } });
    }
    const id = `cs_test_${String(++stripeState.counter).padStart(12, "0")}`;
    const metadata: Record<string, string> = {};
    for (const [k, v] of form) {
      const m = k.match(/^metadata\[(\w+)\]$/);
      if (m) metadata[m[1]] = v;
    }
    const session: StripeSession = {
      id,
      url: `${META_MOCK_URL}/stripe-checkout/${id}`,
      payment_status: "unpaid",
      status: "open",
      amount_total: Number(form.get("line_items[0][price_data][unit_amount]")) * Number(form.get("line_items[0][quantity]")),
      currency: "dkk",
      metadata,
      success_url: form.get("success_url") ?? "",
      customer_email: form.get("customer_email"),
    };
    stripeState.sessions.set(id, session);
    return send(200, session);
  }
  const sessionMatch = path.match(/^\/v1\/checkout\/sessions\/(cs_test_\w+)$/);
  if (method === "GET" && sessionMatch) {
    const session = stripeState.sessions.get(sessionMatch[1]);
    return session ? send(200, session) : send(404, { error: { message: "No such checkout.session" } });
  }
  return send(404, { error: { message: `stripe-mock kender ikke ${method} ${path}` } });
}

export function startMetaMock(): Promise<Server> {
  const log: Logged[] = [];
  let outCounter = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", META_MOCK_URL);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw; // fx formular-kodet (Stripe)
    }
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

    if (url.pathname === "/economic-connect") {
      // Falsk e-conomic-godkendelsesside: sender straks tilbage med et token.
      const redirect = new URL(query.redirectUrl);
      redirect.searchParams.set("token", query.appPublicToken === "test-economic-public" ? "grant-plus" : "bad");
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }
    if (url.pathname.startsWith("/economic-api/")) return economic(req.method ?? "GET", url, body, req.headers, res);
    if (url.pathname.startsWith("/stripe-api/")) return stripe(req.method ?? "GET", url, raw, req.headers, res);
    if (url.pathname.startsWith("/stripe-checkout/")) {
      // Falsk betalingsside: kunden "betaler" straks og sendes tilbage.
      const session = stripeState.sessions.get(url.pathname.split("/").pop() ?? "");
      if (!session) return send(404, { error: "no session" });
      session.payment_status = "paid";
      session.status = "complete";
      res.writeHead(302, { Location: session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id) });
      return res.end();
    }

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
