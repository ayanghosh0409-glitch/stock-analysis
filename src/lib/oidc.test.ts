import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FLOW_MAX_AGE, checkClaims, completeLogin, decodeIdToken, oidcConfig, packFlow, safeReturnTo, startLogin, unpackFlow } from "./oidc";

const env = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", AUTH_SECRET: "0123456789abcdef0123" };
const cfg = oidcConfig(env, "https://site.test")!;
const NOW = Date.parse("2026-11-28T12:00:00Z");

const idToken = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const good = (nonce: string, over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: "cid",
  sub: "g-1",
  email: "Ayan@Example.com",
  email_verified: true,
  name: "Ayan",
  nonce,
  exp: NOW / 1000 + 3600,
  ...over,
});

describe("oidcConfig", () => {
  it("is null unless all three settings exist, and the secret is long enough", () => {
    expect(oidcConfig({}, "https://x")).toBeNull();
    expect(oidcConfig({ ...env, GOOGLE_CLIENT_SECRET: "" }, "https://x")).toBeNull();
    expect(oidcConfig({ ...env, AUTH_SECRET: "short" }, "https://x")).toBeNull();
  });
  it("points at Google and the callback of the site", () => {
    expect(cfg.authUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(cfg.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(cfg.redirectUri).toBe("https://site.test/api/auth/callback");
  });
  it("accepts a stand-in for Google for tests, but never on Vercel's production site", () => {
    const t = { ...env, AUTH_TEST_OIDC: "http://127.0.0.1:9999/" };
    expect(oidcConfig(t, "http://localhost:3000")!.tokenUrl).toBe("http://127.0.0.1:9999/token");
    expect(oidcConfig({ ...t, VERCEL_ENV: "production" }, "https://x")!.tokenUrl).toBe("https://oauth2.googleapis.com/token");
  });
});

describe("safeReturnTo", () => {
  it("keeps paths inside the site, including the dashboard's # pages", () => {
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/#/sector/IT")).toBe("/#/sector/IT");
    expect(safeReturnTo("/stocks?x=1#/a")).toBe("/stocks?x=1#/a");
  });
  it("refuses anything that could leave the site or loop", () => {
    for (const bad of ["//evil.test", "/\\evil.test", "https://evil.test", "javascript:alert(1)", "evil", "", "/a\\b", "/a\nb", "/api/auth/logout", "/sign-in?x", null, undefined, "/" + "a".repeat(400)])
      expect(safeReturnTo(bad as string)).toBe("/");
  });
});

describe("flow cookie", () => {
  it("round-trips and expires", () => {
    const f = { s: "s", v: "v", n: "n", r: "/", e: NOW + 1000 };
    const c = packFlow("k".repeat(20), f);
    expect(unpackFlow("k".repeat(20), c, NOW)).toEqual(f);
    expect(unpackFlow("k".repeat(20), c, NOW + 2000)).toBeNull();
  });
  it("rejects a changed payload, a wrong key and junk", () => {
    const f = { s: "s", v: "v", n: "n", r: "/", e: NOW + 1000 };
    const c = packFlow("k".repeat(20), f);
    const forged = `${Buffer.from(JSON.stringify({ ...f, r: "/#/evil" })).toString("base64url")}.${c.split(".")[1]}`;
    expect(unpackFlow("k".repeat(20), forged, NOW)).toBeNull();
    expect(unpackFlow("z".repeat(20), c, NOW)).toBeNull();
    for (const j of [undefined, "", "a", "a.b", "a.b.c", "."]) expect(unpackFlow("k".repeat(20), j, NOW)).toBeNull();
  });
});

describe("startLogin", () => {
  it("asks Google for the code flow with PKCE, state and nonce, and remembers them in a signed cookie", () => {
    const { url, cookie } = startLogin(cfg, "/#/sector/IT", NOW);
    const u = new URL(url);
    const q = u.searchParams;
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://site.test/api/auth/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("code_challenge_method")).toBe("S256");
    const flow = unpackFlow(cfg.secret, cookie, NOW)!;
    expect(flow).toMatchObject({ r: "/#/sector/IT", e: NOW + FLOW_MAX_AGE * 1000 });
    expect(q.get("state")).toBe(flow.s);
    expect(q.get("nonce")).toBe(flow.n);
    expect(q.get("code_challenge")).toBe(createHash("sha256").update(flow.v).digest("base64url"));
  });
  it("never sends the person anywhere but the site afterwards", () => {
    const { cookie } = startLogin(cfg, "//evil.test", NOW);
    expect(unpackFlow(cfg.secret, cookie, NOW)!.r).toBe("/");
  });
  it("uses fresh secrets every time", () => {
    const a = unpackFlow(cfg.secret, startLogin(cfg, "/", NOW).cookie, NOW)!;
    const b = unpackFlow(cfg.secret, startLogin(cfg, "/", NOW).cookie, NOW)!;
    expect([a.s, a.v, a.n]).not.toEqual([b.s, b.v, b.n]);
  });
});

describe("decodeIdToken / checkClaims", () => {
  it("reads the claims and rejects what is not a token", () => {
    expect(decodeIdToken(idToken({ a: 1 }))).toEqual({ a: 1 });
    for (const bad of [undefined, 3, "a.b", "a.!!.c", `a.${Buffer.from("[1]").toString("base64url")}.c`, `a.${Buffer.from("null").toString("base64url")}.c`]) expect(decodeIdToken(bad)).toBeNull();
  });
  it("accepts a good token and tidies the email", () => {
    expect(checkClaims(good("n"), cfg, "n", NOW)).toEqual({ sub: "g-1", email: "ayan@example.com", name: "Ayan" });
    expect(checkClaims(good("n", { iss: "accounts.google.com", aud: ["x", "cid"], email_verified: "true", name: " " }), cfg, "n", NOW)).toMatchObject({ name: null });
  });
  it.each([
    ["wrong issuer", { iss: "https://evil.test" }],
    ["other client", { aud: "other" }],
    ["wrong nonce", { nonce: "zzz" }],
    ["expired", { exp: NOW / 1000 - 1 }],
    ["no expiry", { exp: undefined }],
    ["no subject", { sub: "" }],
    ["unverified email", { email_verified: false }],
    ["no email", { email: undefined }],
  ])("rejects a token with %s", (_n, over) => {
    expect(checkClaims(good("n", over), cfg, "n", NOW)).toBeNull();
  });
});

describe("completeLogin", () => {
  const begin = () => {
    const { url, cookie } = startLogin(cfg, "/#/sector/IT", NOW);
    const flow = unpackFlow(cfg.secret, cookie, NOW)!;
    return { cookie, flow, state: new URL(url).searchParams.get("state")! };
  };
  const tokenReply = (claims: Record<string, unknown>, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify({ id_token: idToken(claims) }), { status })) as unknown as typeof fetch;

  it("trades the code for who the person is, sending the client secret and PKCE verifier", async () => {
    const { cookie, flow, state } = begin();
    const f = tokenReply(good(flow.n));
    const r = await completeLogin(cfg, { code: "c1", state, error: null }, cookie, f, NOW);
    expect(r).toEqual({ ok: true, identity: { sub: "g-1", email: "ayan@example.com", name: "Ayan" }, returnTo: "/#/sector/IT" });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = init.body as URLSearchParams;
    expect(Object.fromEntries(body)).toMatchObject({ grant_type: "authorization_code", code: "c1", client_secret: "csecret", code_verifier: flow.v, redirect_uri: "https://site.test/api/auth/callback" });
  });

  it("treats 'no' at Google as cancelled, keeping the page to return to", async () => {
    const { cookie } = begin();
    const f = vi.fn() as unknown as typeof fetch;
    expect(await completeLogin(cfg, { code: null, state: null, error: "access_denied" }, cookie, f, NOW)).toEqual({ ok: false, reason: "cancelled", returnTo: "/#/sector/IT" });
    expect(await completeLogin(cfg, { code: null, state: null, error: "server_error" }, cookie, f, NOW)).toMatchObject({ ok: false, reason: "failed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("fails without asking Google when the state, cookie or code do not fit", async () => {
    const { cookie, state } = begin();
    const f = vi.fn() as unknown as typeof fetch;
    for (const [params, c, now] of [
      [{ code: "c", state: "other", error: null }, cookie, NOW],
      [{ code: "c", state: null, error: null }, cookie, NOW],
      [{ code: null, state, error: null }, cookie, NOW],
      [{ code: "c", state, error: null }, undefined, NOW],
      [{ code: "c", state, error: null }, cookie, NOW + FLOW_MAX_AGE * 1000 + 1],
    ] as const)
      expect(await completeLogin(cfg, params, c, f, now)).toMatchObject({ ok: false, reason: "failed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("fails when Google refuses, sends a token for someone else, or is unreachable", async () => {
    const { cookie, flow, state } = begin();
    const p = { code: "c", state, error: null };
    expect(await completeLogin(cfg, p, cookie, tokenReply({}, 400), NOW)).toMatchObject({ ok: false, reason: "failed" });
    expect(await completeLogin(cfg, p, cookie, tokenReply(good(flow.n, { aud: "other" })), NOW)).toMatchObject({ ok: false, reason: "failed" });
    expect(await completeLogin(cfg, p, cookie, tokenReply(good("replayed")), NOW)).toMatchObject({ ok: false, reason: "failed" });
    const down = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await completeLogin(cfg, p, cookie, down, NOW)).toMatchObject({ ok: false, reason: "failed" });
  });
});
