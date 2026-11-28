// Plain and free of server code, so both the server and the sign-in page can use it.

/**
 * A path inside this site to return to after signing in, or "/". Only a single leading slash is accepted, so an address that
 * would leave the site ("//evil.test", "/\\evil.test", "https://evil.test") can never be a place to send someone. The part after
 * a # is the page the dashboard shows, so "/#/sector/IT" is allowed.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "/";
  const v = raw.trim();
  if (v.length === 0 || v.length > 300) return "/";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(v.slice(1))) return "/";
  if (v.startsWith("/api/") || v.startsWith("/sign-in")) return "/";
  return v;
}
