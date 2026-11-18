import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "../../data/stocks.json";
import { benchmarkFor, profitTrend, verdict } from "./screen";
import type { Dataset } from "./types";
import type { Preview } from "./yahoo";
import { NotIndianListing, NothingFound, YahooUnreachable, fetchPreview, searchCandidates } from "./yahoo-client";

/**
 * LIVE check against Yahoo Finance, skipped unless LIVE_YAHOO=1 (the "Live check: Yahoo lookup" workflow sets it).
 * It asserts almost nothing on purpose: its job is to print what Yahoo does and does not supply, in a report a person
 * reads, so a gap shows up as a ✗ in the report and not as a red build.
 */
const live = process.env.LIVE_YAHOO === "1";
const ds = data as Dataset;
const SECTORS = ds.sectors.map((s) => s.name);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Chosen to cover the cases the screen will meet, not just easy ones.
const KINDS: [string, string][] = [
  ["HDFCBANK.NS", "bank"],
  ["BAJFINANCE.NS", "NBFC / lender"],
  ["LICI.NS", "insurer"],
  ["RELIANCE.NS", "conglomerate"],
  ["ONGC.NS", "state-owned"],
  ["TITAN.NS", "consumer, large cap"],
  ["TATAELXSI.NS", "IT, not on the list"],
  ["ETERNAL.NS", "Zomato, recent name change"],
  ["HEXT.NS", "recent listing (2025)"],
  ["IDEA.NS", "loss-making"],
  ["PANAENERG.BO", "small cap, BSE ticker"],
  ["NOSUCHCO.NS", "ticker that does not exist"],
];
// Companies already on the list: the same screen run on Yahoo's figures should give the same verdict as today's.
const LISTED = ["TCS", "INFY", "HCLTECH", "M&M", "MARUTI", "SUNPHARMA", "CIPLA", "HINDUNILVR", "ITC", "BOSCHLTD", "EXIDEIND", "OLAELEC"];
const QUERIES = ["hdfc", "reliance", "zomato", "vodafone idea", "tata elxsi", "asdfqwer"];

const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toFixed(1)}%`);
const tick = (ok: boolean) => (ok ? "✓" : "✗");

describe.skipIf(!live)("live Yahoo Finance check", () => {
  it(
    "reports what Yahoo supplies",
    async () => {
      const out: string[] = ["# Live check: what Yahoo Finance supplies", `Run at ${new Date().toISOString()}`, ""];
      let previews = 0;

      // 1. Search
      out.push("## Search", "", "| Typed | Found |", "| --- | --- |");
      for (const q of QUERIES) {
        try {
          const c = await searchCandidates(q);
          out.push(`| ${q} | ${c.length ? c.map((x) => `${x.name} (${x.ticker})`).join("; ") : "nothing"} |`);
        } catch (e) {
          out.push(`| ${q} | FAILED: ${(e as Error).message.slice(0, 100)} |`);
        }
        await pause(300);
      }

      // 2. Data completeness by kind of company
      out.push("", "## Data completeness", "", "| Ticker | Kind | Price+cap | ROE | ROCE | Profit | History | Sector | ROE | ROCE | Years | Yahoo industry → site sector |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      const failures: string[] = [];
      for (const [ticker, kind] of KINDS) {
        try {
          const p: Preview = await fetchPreview(ticker, SECTORS);
          previews++;
          const ok = Object.fromEntries(p.checks.map((c) => [c.key, c.ok]));
          out.push(`| ${ticker} | ${kind} | ${tick(ok.price)} | ${tick(ok.roe)} | ${tick(ok.roce)} | ${tick(ok.profit)} | ${tick(ok.history)} | ${tick(ok.sector)} | ${pct(p.figures.roe)} | ${pct(p.figures.roce)} | ${p.figures.profitHistory.filter((x) => x !== null).length} | ${p.yahooIndustry ?? "–"} → ${p.suggestedSector ?? "none"} |`);
          const missing = p.checks.filter((c) => !c.ok && c.key !== "sector");
          if (missing.length) failures.push(`- **${ticker}** (${kind}): ${missing.map((c) => `${c.label}: ${c.detail}`).join("; ")}`);
        } catch (e) {
          const why = e instanceof NothingFound ? "Yahoo has nothing for it" : e instanceof NotIndianListing ? "not priced in rupees" : e instanceof YahooUnreachable ? `Yahoo unreachable (${e.message.slice(0, 120)})` : `error: ${(e as Error).message.slice(0, 120)}`;
          out.push(`| ${ticker} | ${kind} | ${why} |`);
        }
        await pause(400);
      }
      if (failures.length) out.push("", "Why figures were missing:", ...failures);

      // 3. Would the screen reach the same verdict on Yahoo's figures as on the figures the site holds today?
      out.push("", "## Same screen, Yahoo's figures vs the site's figures", "", "| Stock | Sector | Site ROE | Yahoo ROE | Site ROCE | Yahoo ROCE | Site verdict | Yahoo verdict | Agree | Yahoo industry → suggested sector |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      let sectorRight = 0;
      let agree = 0;
      let compared = 0;
      for (const sym of LISTED) {
        const sec = ds.sectors.find((s) => s.stocks.some((x) => x.symbol === sym));
        const site = sec?.stocks.find((x) => x.symbol === sym);
        if (!sec || !site) continue;
        const ticker = /^\d+$/.test(sym) ? `${sym}.BO` : `${sym}.NS`;
        try {
          const p = await fetchPreview(ticker, SECTORS);
          previews++;
          const bench = benchmarkFor(site, sec.stocks); // judged against peers without itself, exactly as on the site
          const sv = verdict(site, bench);
          const yv = verdict({ ...p.stock, symbol: site.symbol }, bench);
          compared++;
          if (sv === yv) agree++;
          if (p.suggestedSector === sec.name) sectorRight++;
          out.push(`| ${sym} | ${sec.name} | ${pct(site.roe)} | ${pct(p.figures.roe)} | ${pct(site.roce)} | ${pct(p.figures.roce)} | ${sv} | ${yv} | ${sv === yv ? "✓" : "✗"} | ${p.yahooIndustry ?? "–"} → ${p.suggestedSector ?? "none"} ${p.suggestedSector === sec.name ? "✓" : "✗"} |`);
        } catch (e) {
          out.push(`| ${sym} | ${sec.name} | Yahoo failed: ${(e as Error).message.slice(0, 80)} |`);
        }
        await pause(400);
      }
      out.push("", `**Verdicts agreeing: ${agree} of ${compared}. Sector suggestion matching the sector the stock sits in: ${sectorRight} of ${compared}.**`);

      // 4. Profit trend on the shorter history
      out.push("", "## Profit consistency with Yahoo's four years", "", "| Stock | Site (5 years) | Yahoo (4 years) |", "| --- | --- | --- |");
      for (const sym of ["TCS", "M&M", "SUNPHARMA", "HINDUNILVR"]) {
        const site = ds.sectors.flatMap((s) => s.stocks).find((x) => x.symbol === sym);
        if (!site) continue;
        try {
          const p = await fetchPreview(`${sym}.NS`, SECTORS);
          out.push(`| ${sym} | ${profitTrend(site).consistency} | ${profitTrend(p.stock).consistency} |`);
        } catch {
          out.push(`| ${sym} | ${profitTrend(site).consistency} | Yahoo failed |`);
        }
        await pause(400);
      }

      const report = out.join("\n");
      console.log(report);
      writeFileSync("live-report.md", report + "\n");
      expect(previews, "Yahoo returned no company at all, so the live check proves nothing").toBeGreaterThan(0);
    },
    300_000,
  );
});
