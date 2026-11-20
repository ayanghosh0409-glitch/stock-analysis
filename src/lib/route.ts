/**
 * Which page of the dashboard is showing, kept in the address bar after a "#" so that a page can be linked to, opened in
 * a new tab, and left again with the back button. Nothing here needs the server: the whole dashboard is one page.
 *
 *   #/               Overview
 *   #/all            All stocks
 *   #/sectors        the list of every sector
 *   #/sector/<name>  one sector, the name written as a URL part (spaces and the dash in "Banks—Regional" encoded)
 *
 * A page is identified by one string, `tab`: a sector's own name, or one of the three fixed names below. No sector is
 * called "Overview", "All stocks" or "Sectors", so the names cannot clash.
 */
export const OVERVIEW = "Overview";
export const ALL_STOCKS = "All stocks";
export const SECTORS = "Sectors";

const FIXED = [OVERVIEW, ALL_STOCKS, SECTORS];

/** The "#..." for a page. */
export function hashForTab(tab: string): string {
  if (tab === OVERVIEW) return "#/";
  if (tab === ALL_STOCKS) return "#/all";
  if (tab === SECTORS) return "#/sectors";
  return `#/sector/${encodeURIComponent(tab)}`;
}

/** The page a "#..." names. Anything that is not understood is the Overview. */
export function tabFromHash(hash: string): string {
  const h = hash.replace(/^#/, "");
  if (h === "/all") return ALL_STOCKS;
  if (h === "/sectors") return SECTORS;
  const m = /^\/sector\/(.+)$/.exec(h);
  if (m) {
    try {
      const name = decodeURIComponent(m[1]).trim();
      if (name && !FIXED.includes(name)) return name;
    } catch {
      // a badly written address: fall through to the Overview
    }
  }
  return OVERVIEW;
}
