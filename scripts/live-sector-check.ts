/**
 * Real end-to-end check of "build a sector": for a few sectors and industries it takes the stored top-ten list, fetches
 * every company from Yahoo with the same code /api/stock uses, builds the sector, and prints what the screen says.
 * Changes nothing. Run by the "Live check - build a sector" workflow, because the build sandbox cannot reach Yahoo.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildSector, type Fetched, type Skipped } from "../src/lib/builtSector";
import { benchmarkFor, benchmarks, peerHealth, profitTrend, verdict } from "../src/lib/screen";
import type { SectorFile } from "../src/lib/sectorLists";
import { matchSector } from "../src/lib/sectorMatch";
import { fetchPreview } from "../src/lib/yahoo-client";

const ASK = ["banks", "pharma", "Drug Manufacturers—Specialty & Generic", "insurance life", "it services", "airlines", "real estate"];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (x: number | null) => (x === null ? "–" : (x * 100).toFixed(1) + "%");

async function main() {
  const file = JSON.parse(readFileSync("data/sector-lists.json", "utf8")) as SectorFile;
  const sectors = (JSON.parse(readFileSync("data/stocks.json", "utf8")) as { sectors: { name: string }[] }).sectors.map((s) => s.name);
  const out = ["# Live check: build a sector", "", `Lists fetched ${file.fetchedAt}, ${file.lists.length} lists.`, ""];
  const seen = new Map<string, Fetched | Skipped>();

  for (const q of ASK) {
    const m = matchSector(q, file.lists);
    out.push(`## "${q}" → ${m.status}${m.status === "found" ? ` ${m.list.name}` : m.status === "choose" ? `: ${m.options.map((o) => o.name).join(" | ")}` : `: ${m.suggestions.map((o) => o.name).join(" | ") || "no suggestion"}`}`, "");
    if (m.status !== "found") continue;
    const fetched: Fetched[] = [];
    const skipped: Skipped[] = [];
    for (const s of m.list.stocks) {
      const cached = seen.get(s.symbol);
      if (cached && "preview" in cached) {
        fetched.push(cached);
        continue;
      }
      try {
        let preview;
        for (let attempt = 1; ; attempt++) {
          try {
            preview = await fetchPreview(s.symbol, sectors);
            break;
          } catch (e) {
            if (attempt >= 3 || (e instanceof Error && e.constructor.name !== "YahooUnreachable")) throw e;
            await pause(5000);
          }
        }
        const f = { preview, fetchedAt: new Date().toISOString() };
        seen.set(s.symbol, f);
        fetched.push(f);
      } catch (e) {
        skipped.push({ symbol: s.symbol, name: s.name, reason: `${e instanceof Error ? e.constructor.name : "Error"}: ${e instanceof Error ? e.message.slice(0, 100) : e}` });
      }
      await pause(700);
    }
    const sec = buildSector(m.list, fetched, skipped, sectors);
    const b = benchmarks(sec.stocks);
    out.push(`Industry ROE (median) ${pct(b.medianRoe)}, bar ${pct(b.threshold)}, industry ROCE ${pct(b.medianRoce)}, peer set ${peerHealth(sec.stocks).level}. ${fetched.length} of ${m.list.stocks.length} fetched.`, "");
    out.push("| Stock | Yahoo industry | ROE | ROCE | Years | Verdict | Profit trend |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const st of sec.stocks) {
      const f = fetched.find((x) => x.preview.stock.symbol === st.symbol)!;
      out.push(`| ${st.name} | ${f.preview.yahooIndustry ?? "–"} | ${pct(st.roe)} | ${st.roceNa ? "n/a (bank)" : pct(st.roce)} | ${st.profitHistory?.filter((x) => x !== null).length ?? 0} | ${verdict(st, benchmarkFor(st, sec.stocks))} | ${profitTrend(st).consistency} |`);
    }
    if (skipped.length) out.push("", `Left out: ${skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}`);
    out.push("");
  }
  mkdirSync("sector-out", { recursive: true });
  writeFileSync("sector-out/live-report.md", out.join("\n") + "\n");
  console.log(out.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
