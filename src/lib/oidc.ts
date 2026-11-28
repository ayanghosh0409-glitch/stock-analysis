import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Sign in with Google, as plain functions: the OpenID Connect "authorization code" flow with PKCE. Nothing here touches the
 * database, the request or the network on its own, so every step can be tested; the routes in src/app/api/auth call them.
 *
 * The flow: startLogin builds the Google address and a signed cookie holding the one-time state, nonce and PKCE secret.
 * Google sends the person back with a code; completeLogin checks the cookie against the address, trades the code for an ID
 * token over HTTPS using the client secret, and checks who the token is for. The ID token comes straight from Google's token
 * endpoint over TLS, so (as OpenID Connect allows for that case) its signature is not checked again; its claims are.
 */

import { safeReturnTo } from "./returnTo";

export { safeReturnTo };
export const SESSION_COOKIE = "sa_session";
export const FLOW_COOKIE = "sa_oauth";
/** How long a person has to finish at Google before the sign-in attempt expires, in seconds. */
export const FLOW_MAX_AGE = 600;

type Env = Record<string, string | undefined>;

export type OidcConfig = {
  clientId: string;
  clientSecret: string;
  /** Signs the short-lived cookie that ties a sign-in attempt to one browser. */
  secret: string;
  authUrl: string;
  tokenUrl: string;
  /** Values the token's `iss` may have. Google uses both spellings. */
  issuers: string[];
  redirectUri: string;
};

const GOOGLE = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};

/**
 * The sign-in settings, or null when the site has none (a missing key means "not set up", never a half-working sign-in).
 * AUTH_TEST_OIDC points the flow at a stand-in for Google, for tests only; it is ignored on Vercel's production site.
 */
export function oidcConfig(env: Env, origin: string): OidcConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const secret = env.AUTH_SECRET?.trim();
  if (!clientId || !clientSecret || !secret || secret.length < 16) return null;
  const test = env.AUTH_TEST_OIDC?.trim().replace(/\/+$/, "");
  const standIn = test && env.VERCEL_ENV !== "production" ? test : null;
  return {
    clientId,
    clientSecret,
    secret,
    authUrl: standIn ? `${standIn}/authorize` : GOOGLE.authUrl,
    tokenUrl: standIn ? `${standIn}/token` : GOOGLE.tokenUrl,
    issuers: standIn ? [standIn] : GOOGLE.issuers,
    redirectUri: `${origin}/api/auth/callback`,
  };
}

// ---- small helpers ----------------------------------------------------------------------------------------------------

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString("base64url");
const sha256 = (s: string): Buffer => createHash("sha256").update(s).digest();
const sign = (secret: string, payload: string): string => b64url(createHmac("sha256", secret).update(payload).digest());

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- starting a sign-in -----------------------------------------------------------------------------------------------

type Flow = { s: string; v: string; n: string; r: string; e: number };

/** The cookie value: the flow as JSON, then a signature, so it cannot be forged or edited by a script on another site. */
export function packFlow(secret: string, flow: Flow): string {
  const payload = b64url(JSON.stringify(flow));
  return `${payload}.${sign(secret, payload)}`;
}

export function unpackFlow(secret: string, value: string | undefined, now: number): Flow | null {
  if (!value) return null;
  const [payload, sig, extra] = value.split(".");
  if (!payload || !sig || extra !== undefined || !sameText(sig, sign(secret, payload))) return null;
  try {
    const f = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Flow;
    const ok = [f.s, f.v, f.n, f.r].every((x) => typeof x === "string" && x) && typeof f.e === "number";
    return ok && f.e > now ? f : null;
  } catch {
    return null;
  }
}

/** Where to send the person (Google's address) and the cookie to set before they go. */
export function startLogin(cfg: OidcConfig, returnTo: string, now: number = Date.now(), random: (n: number) => Buffer = randomBytes): { url: string; cookie: string } {
  const flow: Flow = { s: b64url(random(24)), v: b64url(random(32)), n: b64url(random(24)), r: safeReturnTo(returnTo), e: now + FLOW_MAX_AGE * 1000 };
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.s,
    nonce: flow.n,
    code_challenge: b64url(sha256(flow.v)),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${cfg.authUrl}?${q}`, cookie: packFlow(cfg.secret, flow) };
}

// ---- finishing it -----------------------------------------------------------------------------------------------------

export type Identity = { sub: string; email: string; name: string | null };

export type LoginResult =
  | { ok: true; identity: Identity; returnTo: string }
  /** `cancelled`: the person said no at Google. `failed`: anything else, and nothing was changed. */
  | { ok: false; reason: "cancelled" | "failed"; returnTo: string };

/** Reads the ID token's claims. The token is not verified here (see the note at the top); `checkClaims` judges the content. */
export function decodeIdToken(token: unknown): Record<string, unknown> | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims && typeof claims === "object" && !Array.isArray(claims) ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The token must be issued by Google for this site, for this very sign-in, not expired, and carry a verified email. */
export function checkClaims(claims: Record<string, unknown>, cfg: OidcConfig, nonce: string, now: number): Identity | null {
  const aud = claims.aud;
  const forUs = aud === cfg.clientId || (Array.isArray(aud) && aud.includes(cfg.clientId));
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (typeof claims.iss !== "string" || !cfg.issuers.includes(claims.iss)) return null;
  if (!forUs || claims.nonce !== nonce) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.email !== "string" || !claims.email || !verified) return null;
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : null;
  return { sub: claims.sub, email: claims.email.trim().toLowerCase().slice(0, 254), name };
}

/**
 * What Google sent back, judged against the cookie we set. `fetchFn` is passed in so tests can stand in for Google.
 * A mismatch of any kind is a plain "failed": the page never says which check it was, and no account is touched.
 */
export async function completeLogin(
  cfg: OidcConfig,
  params: { code: string | null; state: string | null; error: string | null },
  flowCookie: string | undefined,
  fetchFn: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<LoginResult> {
  const flow = unpackFlow(cfg.secret, flowCookie, now);
  const returnTo = flow?.r ?? "/";
  const fail = (reason: "cancelled" | "failed"): LoginResult => ({ ok: false, reason, returnTo });

  if (params.error) return fail(params.error === "access_denied" ? "cancelled" : "failed");
  if (!flow || !params.code || !params.state || !sameText(params.state, flow.s)) return fail("failed");

  try {
    const res = await fetchFn(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code_verifier: flow.v,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fail("failed");
    const body = (await res.json()) as { id_token?: unknown };
    const claims = decodeIdToken(body.id_token);
    const identity = claims ? checkClaims(claims, cfg, flow.n, now) : null;
    return identity ? { ok: true, identity, returnTo } : fail("failed");
  } catch {
    return fail("failed");
  }
}
