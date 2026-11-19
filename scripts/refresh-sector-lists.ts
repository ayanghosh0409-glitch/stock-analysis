/**
 * Builds data/sector-lists.json: for each Yahoo sector and industry, the ten largest NSE stocks by market cap.
 * Run weekly by the "Refresh sector lists" workflow, or by hand: `npx tsx scripts/refresh-sector-lists.ts [--apply]`.
 *
 * Yahoo rate-limits shared servers, so calls are spaced out and a failed one is retried. A sector or industry with no
 * NSE stocks is left out. The file is only written with --apply, and only if most of the lists came back, so a bad
 * night at Yahoo cannot empty the stored lists.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TOP_N, type SectorFile, type SectorList, type Taxonomy } from "../src/lib/sectorLists";
import { fetchTopStocks } from "../src/lib/yahoo-client";

const DATA = "data/sector-lists.json";
const OUT = "sector-out";
const apply = process.argv.includes("--apply");
const MIN_SHARE = 0.8; // refuse to overwrite the file if fewer than this share of the lists could be fetched
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchList(field: "sector" | "industry", name: string): Promise<{ total: number; stocks: SectorList["stocks"] } | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fetchTopStocks(field, name, TOP_N);
    } catch (e) {
      console.error(`${field} ${name}: attempt ${attempt} failed: ${e instanceof Error ? e.message : e}`);
      await pause(attempt * 20_000);
    }
  }
  return null;
}

async function main() {
  const tax = JSON.parse(readFileSync("data/yahoo-taxonomy.json", "utf8")) as Taxonomy;
  const jobs: { kind: "sector" | "industry"; name: string; sector: string | null }[] = [];
  for (const [sector, industries] of Object.entries(tax.sectors)) {
    jobs.push({ kind: "sector", name: sector, sector: null });
    for (const i of industries) jobs.push({ kind: "industry", name: i, sector });
  }

  const lists: SectorList[] = [];
  const failed: string[] = [];
  const empty: string[] = [];
  for (const j of jobs) {
    const r = await fetchList(j.kind, j.name);
    if (!r) failed.push(`${j.kind}: ${j.name}`);
    else if (r.stocks.length === 0) empty.push(j.name);
    else lists.push({ kind: j.kind, name: j.name, sector: j.sector, total: r.total, stocks: r.stocks });
    console.log(`${r ? (r.stocks.length ? "ok   " : "empty") : "FAIL "} ${j.kind} ${j.name}${r ? ` (${r.total} stocks, ${r.stocks.length} kept)` : ""}`);
    await pause(600);
  }

  const file: SectorFile = { fetchedAt: new Date().toISOString().slice(0, 10), lists };
  const fetched = jobs.length - failed.length;
  const report = [
    "# Sector lists",
    "",
    `${lists.length} lists kept (${lists.filter((l) => l.kind === "sector").length} sectors, ${lists.filter((l) => l.kind === "industry").length} industries) out of ${jobs.length} asked for.`,
    `${empty.length} had no NSE stocks and were left out: ${empty.join(", ") || "none"}.`,
    `${failed.length} could not be fetched: ${failed.join("; ") || "none"}.`,
    `${lists.filter((l) => l.stocks.length < TOP_N).length} lists hold fewer than ${TOP_N} stocks because Yahoo has fewer.`,
    "",
  ].join("\n");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/report.md`, report);
  writeFileSync(`${OUT}/sector-lists.json`, JSON.stringify(file, null, 1) + "\n");
  console.log(report);

  if (apply) {
    if (fetched / jobs.length < MIN_SHARE) throw new Error(`Only ${fetched} of ${jobs.length} lists could be fetched; refusing to overwrite ${DATA}.`);
    writeFileSync(DATA, JSON.stringify(file, null, 1) + "\n");
    console.log(`Wrote ${DATA}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
