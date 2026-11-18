/**
 * Re-sources data/stocks.json from Yahoo Finance, with the same code the company lookup uses (src/lib/yahoo.ts).
 *
 *   npx tsx scripts/resource-yahoo.ts            fetch all stocks, write a before/after report and the new data to resource-out/
 *   npx tsx scripts/resource-yahoo.ts --apply    the same, and also overwrite data/stocks.json
 *
 * Needs the network, so it runs in GitHub Actions (.github/workflows/resource-yahoo.yml). A stock for which Yahoo does not
 * supply everything the screen needs keeps its old figures and is listed in the report.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { HOLD_BACK, compare, holdBack, mergeStock, report, tickersFor, type Merge } from "../src/lib/resource";
import type { Dataset } from "../src/lib/types";
import type { Preview } from "../src/lib/yahoo";
import { fetchPreview } from "../src/lib/yahoo-client";

const apply = process.argv.includes("--apply");
const OUT = "resource-out";
const DATA = "data/stocks.json";
const MIN_SHARE = 0.5; // refuse to overwrite the data if Yahoo gave usable figures for fewer than this share of stocks

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const why = (e: unknown) => (e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)).slice(0, 160);

/** Yahoo now and then answers without a price or market cap for a stock it has just served; asking again a few seconds later fixes it. */
const incomplete = (p: Preview) => p.figures.price === null || p.figures.marketCap === null;

async function previewFor(symbol: string, sectors: string[]): Promise<{ p: Preview | null; failure?: string }> {
  let failure = "no ticker worked";
  let last: Preview | null = null;
  for (const t of tickersFor(symbol)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const p = await fetchPreview(t, sectors);
        if (!incomplete(p) || attempt === 2) return { p };
        last = p;
        failure = `${t}: Yahoo answered without a price or market cap`;
        await pause(4000);
      } catch (e) {
        failure = `${t}: ${why(e)}`;
        if (e instanceof Error && e.constructor.name === "YahooUnreachable") await pause(4000);
        else break; // nothing found / not Indian: retrying will not change it
      }
    }
  }
  return last ? { p: last } : { p: null, failure };
}

async function main() {
  const before = JSON.parse(readFileSync(DATA, "utf8")) as Dataset;
  const sectorNames = before.sectors.map((s) => s.name);
  const merges = new Map<string, Merge>();
  const after: Dataset = { ...before, asOf: new Date().toISOString().slice(0, 10), sectors: [] };

  for (const sec of before.sectors) {
    const stocks = [];
    for (const s of sec.stocks) {
      const held = HOLD_BACK[s.symbol];
      const { p, failure } = held ? { p: null, failure: undefined } : await previewFor(s.symbol, sectorNames);
      const m = held ? holdBack(s, held) : mergeStock(s, p, failure);
      merges.set(s.symbol, m);
      stocks.push(m.stock);
      console.log(`${m.fromYahoo ? "yahoo" : "KEPT "} ${s.symbol}${m.missing.length ? ` — ${m.missing.join("; ")}` : ""}`);
      if (!held) await pause(500);
    }
    after.sectors.push({ ...sec, stocks });
  }

  const total = merges.size;
  const used = new Set([...merges].filter(([, m]) => m.fromYahoo).map(([k]) => k));
  const { rows, sectors } = compare(before, after, used);
  const text = report({ rows, sectors, merges, total, when: new Date().toISOString() });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report.md`, text);
  writeFileSync(`${OUT}/stocks.json`, JSON.stringify(after, null, 1) + "\n");
  console.log(text);

  if (used.size === 0) throw new Error("Yahoo gave nothing for any stock; check that Yahoo is reachable.");
  if (apply) {
    if (used.size / total < MIN_SHARE) throw new Error(`Only ${used.size} of ${total} stocks came from Yahoo; refusing to overwrite ${DATA}.`);
    writeFileSync(DATA, JSON.stringify(after, null, 1) + "\n");
    console.log(`Wrote ${DATA}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
