import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";

const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("@/lib/db", () => ({ getDb: () => state.db }));

import { GET as callback } from "./callback/route";
import { GET as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";

const SITE = "http://site.test";
let pg: PGlite;
let n = 0;
const ip = () => `10.9.0.${++n}`;
const cookieOf = (res: Response, name: string) => {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line ? { value: line.split(";")[0].slice(name.length + 1), line } : null;
};
const idToken = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

/** A pretend Google: answers the token request with an ID token for `who`, using the nonce the login started with. */
function googleSays(nonce: string, over: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ id_token: idToken({ iss: "https://accounts.google.com", aud: "cid", sub: "g-1", email: "ayan@example.com", email_verified: true, name: "Ayan", nonce, exp: Date.now() / 1000 + 3600, ...over }) }),
    ),
  );
}

/** Runs the first half and returns what the browser would hold: the flow cookie and the state Google would echo. */
async function startSignIn(returnTo?: string) {
  const res = await login(new NextRequest(`${SITE}/api/auth/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`, { headers: { "x-forwarded-for": ip() } }));
  const to = new URL(res.headers.get("location")!);
  return { res, to, flow: cookieOf(res, "sa_oauth")!, state: to.searchParams.get("state")!, nonce: to.searchParams.get("nonce")! };
}
const back = (params: string, flow?: string) => callback(new NextRequest(`${SITE}/api/auth/callback?${params}`, { headers: flow ? { cookie: `sa_oauth=${flow}` } : {} }));

beforeAll(() => {
  pg = new PGlite();
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.query("drop table if exists sessions");
  await pg.query("drop table if exists users");
  state.db = { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows as T[] }) };
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
  vi.stubEnv("AUTH_SECRET", "0123456789abcdef0123");
  vi.stubEnv("AUTH_URL", "");
  vi.stubEnv("AUTH_TEST_OIDC", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/auth/login", () => {
  it("sends the browser to Google with a one-time cookie that JavaScript cannot read", async () => {
    const { res, to, flow } = await startSignIn("/#/sector/IT");
    expect(res.status).toBe(307);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("redirect_uri")).toBe(`${SITE}/api/auth/callback`);
    expect(flow.line).toMatch(/HttpOnly/i);
    expect(flow.line).toMatch(/SameSite=lax/i);
    expect(flow.line).toMatch(/Path=\/api\/auth/);
    expect(flow.line).not.toMatch(/Secure/i); // plain http on this test site
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("marks cookies Secure on an https site, and takes the address from AUTH_URL when set", async () => {
    vi.stubEnv("AUTH_URL", "https://live.example/");
    const { to, flow } = await startSignIn();
    expect(to.searchParams.get("redirect_uri")).toBe("https://live.example/api/auth/callback");
    expect(flow.line).toMatch(/Secure/i);
  });

  it("says sign-in is not set up when a setting or the database is missing", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const res = await login(new NextRequest(`${SITE}/api/auth/login?returnTo=/%23/sector/IT`, { headers: { "x-forwarded-for": ip() } }));
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/sign-in?error=unconfigured&returnTo=%2F%23%2Fsector%2FIT");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "x");
    state.db = null;
    expect(new URL((await login(new NextRequest(`${SITE}/api/auth/login`, { headers: { "x-forwarded-for": ip() } }))).headers.get("location")!).searchParams.get("error")).toBe("unconfigured");
  });

  it("limits how often one caller can start a sign-in", async () => {
    const from = ip();
    const hit = () => login(new NextRequest(`${SITE}/api/auth/login`, { headers: { "x-forwarded-for": from } }));
    for (let i = 0; i < 20; i++) expect((await hit()).headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com/);
    expect(new URL((await hit()).headers.get("location")!).searchParams.get("error")).toBe("failed");
  });

  it("never lets the return address leave the site", async () => {
    const s = await startSignIn("//evil.test");
    googleSays(s.nonce);
    expect((await back(`code=c&state=${s.state}`, s.flow.value)).headers.get("location")).toBe(`${SITE}/`);
  });
});

describe("GET /api/auth/callback", () => {
  it("signs the person in, creates the account and returns them to the page they left", async () => {
    const s = await startSignIn("/#/sector/IT");
    googleSays(s.nonce);
    const res = await back(`code=c&state=${s.state}`, s.flow.value);
    expect(res.headers.get("location")).toBe(`${SITE}/#/sector/IT`);
    const sess = cookieOf(res, "sa_session")!;
    expect(sess.line).toMatch(/HttpOnly/i);
    expect(sess.line).toMatch(/SameSite=lax/i);
    expect(sess.line).toMatch(/Max-Age=2592000/);
    expect(cookieOf(res, "sa_oauth")!.line).toMatch(/Max-Age=0/); // the one-time cookie is spent

    const who = await session(new NextRequest(`${SITE}/api/auth/session`, { headers: { cookie: `sa_session=${sess.value}` } }));
    expect(await who.json()).toEqual({ configured: true, user: { email: "ayan@example.com", name: "Ayan" } });
    expect(who.headers.get("cache-control")).toBe("no-store");
    expect((await pg.query("select count(*)::int as n from users")).rows[0]).toEqual({ n: 1 });
  });

  it("recognises the same person next time instead of making a second account", async () => {
    for (let i = 0; i < 2; i++) {
      const s = await startSignIn();
      googleSays(s.nonce);
      await back(`code=c&state=${s.state}`, s.flow.value);
    }
    expect((await pg.query("select count(*)::int as n from users")).rows[0]).toEqual({ n: 1 });
    expect((await pg.query("select count(*)::int as n from sessions")).rows[0]).toEqual({ n: 2 });
  });

  it("treats 'no' at Google as cancelled and keeps the page to return to", async () => {
    const s = await startSignIn("/#/sector/IT");
    const res = await back("error=access_denied", s.flow.value);
    expect(res.headers.get("location")).toBe(`${SITE}/sign-in?error=cancelled&returnTo=%2F%23%2Fsector%2FIT`);
    expect(cookieOf(res, "sa_session")).toBeNull();
  });

  it("fails safely, with no session and no account, for a wrong state, a missing cookie or a token for someone else", async () => {
    const s = await startSignIn();
    googleSays(s.nonce);
    for (const [params, flow] of [
      [`code=c&state=forged`, s.flow.value],
      [`code=c&state=${s.state}`, undefined],
      [`code=c&state=${s.state}`, `${s.flow.value}x`],
      [``, s.flow.value],
    ] as const) {
      const res = await back(params, flow);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/sign-in");
      expect(cookieOf(res, "sa_session")).toBeNull();
    }
    googleSays(s.nonce, { aud: "someone-else" });
    const res = await back(`code=c&state=${s.state}`, s.flow.value);
    expect(res.headers.get("location")).toMatch(/error=failed/);
    expect((await pg.query("select to_regclass('users') as t")).rows[0]).toEqual({ t: null }); // nothing was even created
  });

  it("fails safely when the database breaks halfway", async () => {
    const s = await startSignIn();
    googleSays(s.nonce);
    state.db = {
      query: async () => {
        throw new Error("db down");
      },
    };
    const res = await back(`code=c&state=${s.state}`, s.flow.value);
    expect(res.headers.get("location")).toMatch(/error=failed/);
    expect(cookieOf(res, "sa_session")).toBeNull();
  });
});

describe("GET /api/auth/session", () => {
  it("shows a guest, and whether sign-in is set up", async () => {
    const guest = await session(new NextRequest(`${SITE}/api/auth/session`));
    expect(await guest.json()).toEqual({ configured: true, user: null });
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(await (await session(new NextRequest(`${SITE}/api/auth/session`))).json()).toEqual({ configured: false, user: null });
  });

  it("treats a made-up or ended session as a guest", async () => {
    const res = await session(new NextRequest(`${SITE}/api/auth/session`, { headers: { cookie: `sa_session=${"A".repeat(43)}` } }));
    expect((await res.json()).user).toBeNull();
  });
});

describe("POST /api/auth/logout", () => {
  async function signedIn() {
    const s = await startSignIn();
    googleSays(s.nonce);
    return cookieOf(await back(`code=c&state=${s.state}`, s.flow.value), "sa_session")!.value;
  }
  const out = (token: string | null, headers: Record<string, string> = {}) =>
    logout(new NextRequest(`${SITE}/api/auth/logout`, { method: "POST", headers: { host: "site.test", ...(token ? { cookie: `sa_session=${token}` } : {}), ...headers } }));

  it("ends the session for good and clears the cookie", async () => {
    const token = await signedIn();
    const res = await out(token, { "sec-fetch-site": "same-origin", origin: SITE });
    expect(res.status).toBe(200);
    expect(cookieOf(res, "sa_session")!.line).toMatch(/Max-Age=0/);
    const who = await session(new NextRequest(`${SITE}/api/auth/session`, { headers: { cookie: `sa_session=${token}` } }));
    expect((await who.json()).user).toBeNull(); // the copied token is dead too
  });

  it("refuses a request that comes from another site", async () => {
    const token = await signedIn();
    for (const h of [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.test" }] as Record<string, string>[]) expect((await out(token, h)).status).toBe(403);
    const who = await session(new NextRequest(`${SITE}/api/auth/session`, { headers: { cookie: `sa_session=${token}` } }));
    expect((await who.json()).user).not.toBeNull();
  });

  it("is fine for a guest", async () => {
    expect((await out(null, { "sec-fetch-site": "same-origin" })).status).toBe(200);
  });
});
