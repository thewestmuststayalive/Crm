import "server-only";
import { createHmac } from "node:crypto";

// Lille klient til Metas Graph API. Alle kald signeres med appsecret_proof,
// så et lækket token ikke kan bruges uden app-hemmeligheden.

export type MetaConfig = {
  appId: string;
  appSecret: string;
  verifyToken: string;
  graphUrl: string;
  version: string;
};

/** Returnerer konfigurationen, eller null hvis Meta-nøglerne ikke er sat endnu. */
export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (!appId || !appSecret || !verifyToken) return null;
  return {
    appId,
    appSecret,
    verifyToken,
    graphUrl: (process.env.META_GRAPH_URL ?? "https://graph.facebook.com").replace(/\/$/, ""),
    version: process.env.META_GRAPH_VERSION ?? "v23.0",
  };
}

export function requireMetaConfig(): MetaConfig {
  const config = getMetaConfig();
  if (!config) throw new Error("Meta er ikke sat op (META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN).");
  return config;
}

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
  ) {
    super(message);
  }
}

function appSecretProof(token: string, secret: string) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string | null,
  params: Record<string, string> = {},
  body?: unknown,
): Promise<T> {
  const config = requireMetaConfig();
  const url = new URL(`${config.graphUrl}/${config.version}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", appSecretProof(token, config.appSecret));
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) {
    throw new GraphError(json.error?.message ?? `Meta svarede ${res.status}`, res.status, json.error?.code);
  }
  return json;
}

export const graph = {
  get: <T>(path: string, token: string | null, params?: Record<string, string>) => call<T>("GET", path, token, params),
  post: <T>(path: string, token: string | null, body?: unknown, params?: Record<string, string>) =>
    call<T>("POST", path, token, params, body),
  delete: <T>(path: string, token: string | null, params?: Record<string, string>) =>
    call<T>("DELETE", path, token, params),
};

/** Henter alle sider af et pagineret Graph-svar (op til en grænse). */
export async function graphGetAll<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  maxPages = 10,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await graph.get<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, token, {
      ...params,
      ...(after ? { after } : {}),
    });
    out.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}
