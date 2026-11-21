import { createServer, type Server } from "node:http";

// En lille falsk udgave af Metas Graph API, så hele Meta-integrationen kan testes
// uden rigtige nøgler. Appen peges hertil med META_GRAPH_URL/META_OAUTH_URL.

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
      case "POST /PAGE1/messages":
        outCounter++;
        return send(200, { recipient_id: body?.recipient?.id, message_id: `m_out_${outCounter}` });
      default:
        return send(404, { error: { message: `Mock kender ikke ${key}` } });
    }
  });

  return new Promise((resolve) => server.listen(META_MOCK_PORT, () => resolve(server)));
}
