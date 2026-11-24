import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { WebsiteCheck } from "@/db/schema";
import { websiteHref } from "./prospects";

// Hjemmeside-tjek af et leads side. Henter kun offentlige adresser: interne netværk,
// localhost og andre private IP-adresser afvises – også efter omdirigeringer og ved
// selve forbindelsen (DNS-opslaget tjekkes, når der forbindes), så tjekket ikke kan
// bruges til at kigge ind i interne systemer. Kun port 80 og 443.

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;

/**
 * Kun til e2e-tests: præcise "vært:port"-par, der må nås selv om de er interne (fx "localhost:3999").
 * Sættes aldrig i drift. Alle andre interne adresser afvises stadig.
 */
function testAllowList() {
  return new Set(
    (process.env.WEBSITE_CHECK_ALLOW_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}
const allowedHostnames = () => new Set([...testAllowList()].map((h) => h.replace(/:\d+$/, "")));

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (v.startsWith("::ffff:") || v.startsWith("64:ff9b:")) return true;
    return /^(f[cd]|fe[89ab]|ff)/.test(v);
  }
  return true;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const blocked = !allowedHostnames().has(hostname.toLowerCase()) && addresses.some((a) => isPrivateIp(a.address));
    if (blocked || addresses.length === 0) {
      return callback(Object.assign(new Error("Adressen er ikke offentlig"), { code: "EBLOCKED" }), "");
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

type Fetched = { status: number; location: string | null; body: string };

function request(url: URL): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as never,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Kundespor-hjemmesidetjek/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "da,en;q=0.5",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, body: "" });
        }
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            stream.destroy();
            req.destroy();
            return resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") });
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

function assertAllowed(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Kun http og https");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (testAllowList().has(`${url.hostname.toLowerCase()}:${port}`)) return;
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Kun port 80 og 443");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && isPrivateIp(host)) throw new Error("Adressen er ikke offentlig");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Adressen er ikke offentlig");
  }
}

/** Henter en side og følger omdirigeringer – hver ny adresse tjekkes igen. */
async function fetchPage(start: URL) {
  let url = start;
  const started = Date.now();
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    assertAllowed(url);
    const res = await request(url);
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = new URL(res.location, url);
      continue;
    }
    return { ...res, finalUrl: url, ms: Date.now() - started };
  }
  throw new Error("For mange omdirigeringer");
}

const has = (html: string, re: RegExp) => re.test(html);

/** Analyserer HTML'en og giver en score fra 0 til 100 samt forslag til, hvad man kan sælge. */
export function analyzeHtml(html: string, opts: { https: boolean; ms: number; finalUrl: string }, now = new Date()) {
  const year = now.getFullYear();
  const mobile = has(html, /<meta[^>]+name=["']?viewport["']?[^>]*width\s*=\s*device-width/i)
    || has(html, /<meta[^>]+content=["'][^"']*width\s*=\s*device-width[^>]+name=["']?viewport/i);
  const title = html.match(/<title[^>]*>([^<]{1,200})/i)?.[1]?.trim() ?? null;
  const metaDescription =
    has(html, /<meta[^>]+name=["']?description["']?[^>]+content=["'][^"']{10,}/i) ||
    has(html, /<meta[^>]+content=["'][^"']{10,}["'][^>]+name=["']?description/i);
  const metaPixel = has(html, /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i);
  const googleTag = has(html, /googletagmanager\.com\/(gtag\/js|gtm\.js)|gtag\(\s*['"]config|GTM-[A-Z0-9]{4,}/);
  const booking = has(
    html,
    /book\s+(en\s+)?tid|bestil\s+tid|online\s*booking|book\s+nu|tidsbestilling|booksy|planway|simplybook|calendly|easytable|dinnerbooking|onlinebooq|bookingsystem/i,
  );
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*(?:-|–|&ndash;)\s*)?(\d{4})/gi)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1995 && y <= year + 1);
  const copyrightYear = years.length ? Math.max(...years) : null;
  const platform = /wp-content|wp-includes/i.test(html)
    ? "WordPress"
    : /wixstatic\.com|wix\.com/i.test(html)
      ? "Wix"
      : /cdn\.shopify\.com/i.test(html)
        ? "Shopify"
        : /squarespace/i.test(html)
          ? "Squarespace"
          : /webflow/i.test(html)
            ? "Webflow"
            : null;

  let score = 100;
  const angles: string[] = [];
  if (!opts.https) {
    score -= 20;
    angles.push("Siden er ikke sikker (mangler https), så browsere advarer de besøgende");
  }
  if (!mobile) {
    score -= 25;
    angles.push("Siden er ikke mobilvenlig – tilbyd en ny, mobilvenlig hjemmeside");
  }
  if (opts.ms > 3000) {
    score -= 15;
    angles.push(`Siden er langsom (${(opts.ms / 1000).toFixed(1).replace(".", ",")} sek.) – tilbyd hastighedsoptimering`);
  } else if (opts.ms > 1500) {
    score -= 5;
  }
  if (copyrightYear !== null && copyrightYear <= year - 3) {
    score -= 15;
    angles.push(`Siden ser gammel ud (© ${copyrightYear}) – tilbyd et redesign`);
  }
  if (!metaDescription) {
    score -= 5;
    angles.push("Mangler beskrivelse til Google – svag synlighed i søgeresultater");
  }
  if (!metaPixel && !googleTag) score -= 10;
  if (!metaPixel) angles.push("Ingen Meta Pixel – de kan ikke måle eller målrette annoncer på Facebook og Instagram");
  if (!googleTag) angles.push("Ingen Google-sporing – de måler ikke besøg og annoncer");
  if (!booking) angles.push("Ingen online booking – kunderne skal ringe eller skrive for at bestille");
  if (angles.length === 0) angles.push("Hjemmesiden er i god stand – sælg hellere annoncer eller SEO");

  return {
    ok: true,
    finalUrl: opts.finalUrl,
    https: opts.https,
    mobile,
    responseMs: opts.ms,
    title,
    metaDescription,
    metaPixel,
    googleTag,
    booking,
    copyrightYear,
    platform,
    score: Math.max(0, Math.min(100, score)),
    angles,
  } satisfies WebsiteCheck;
}

export async function checkWebsite(website: string | null | undefined): Promise<WebsiteCheck> {
  if (!website?.trim()) {
    return { ok: false, error: "Har ingen hjemmeside", score: 0, angles: ["Har ingen hjemmeside – tilbyd en ny hjemmeside"] };
  }
  let start: URL;
  try {
    start = new URL(websiteHref(website.trim()));
  } catch {
    return { ok: false, error: "Ugyldig adresse", score: 0, angles: [] };
  }
  const attempts = [start];
  // Uden https: prøv den almindelige http-adresse som reserve.
  if (start.protocol === "https:" && !/^https:\/\//i.test(website.trim())) {
    const plain = new URL(start);
    plain.protocol = "http:";
    attempts.push(plain);
  }
  let lastError = "Siden svarer ikke";
  for (const url of attempts) {
    try {
      const page = await fetchPage(url);
      if (page.status >= 400) {
        lastError = `Siden svarer med fejl (${page.status})`;
        continue;
      }
      return analyzeHtml(page.body, {
        https: page.finalUrl.protocol === "https:",
        ms: page.ms,
        finalUrl: page.finalUrl.toString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/ikke offentlig|Kun port|Kun http/.test(message)) {
        return { ok: false, error: "Adressen kan ikke tjekkes", score: 0, angles: [] };
      }
      lastError = message === "timeout" ? "Siden svarer ikke inden for 8 sekunder" : "Siden svarer ikke";
    }
  }
  return {
    ok: false,
    error: lastError,
    score: 5,
    angles: ["Hjemmesiden virker ikke – de mister kunder lige nu. Tilbyd at få den op at køre"],
  };
}
