/**
 * Which page of the dashboard is showing, kept in the address bar after a "#" so that a page can be linked to, opened in
 * a new tab, and left again with the back button. Nothing here needs the server: the whole dashboard is one page.
 *
 *   #/               Overview
 *   #/all            All stocks
 *   #/sector/<name>  one sector, the name written as a URL part (spaces and the dash in "Banks—Regional" encoded)
 *
 * A page is identified by one string, `tab`: a sector's own name, or one of the two fixed names below. No sector is
 * called "Overview" or "All stocks", so the names cannot clash.
 */
export const OVERVIEW = "Overview";
export const ALL_STOCKS = "All stocks";

/** The "#..." for a page. */
export function hashForTab(tab: string): string {
  if (tab === OVERVIEW) return "#/";
  if (tab === ALL_STOCKS) return "#/all";
  return `#/sector/${encodeURIComponent(tab)}`;
}

/** The page a "#..." names. Anything that is not understood is the Overview. */
export function tabFromHash(hash: string): string {
  const h = hash.replace(/^#/, "");
  if (h === "/all") return ALL_STOCKS;
  const m = /^\/sector\/(.+)$/.exec(h);
  if (m) {
    try {
      const name = decodeURIComponent(m[1]).trim();
      if (name && name !== OVERVIEW && name !== ALL_STOCKS) return name;
    } catch {
      // a badly written address: fall through to the Overview
    }
  }
  return OVERVIEW;
}
