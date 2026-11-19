/**
 * SPIKE: can Yahoo Finance give us "the top 10 Indian stocks in a sector or industry"?
 *
 * yahoo-finance2 has no sector or industry module and its `screener` only runs Yahoo's ready-made lists. Yahoo's own
 * website uses a custom screener endpoint (POST /v1/finance/screener with a query body), so this tries that through the
 * library's cookie and crumb handling. It prints a report of what comes back; it changes no data.
 *
 * Run by the "Spike - sector lookup" workflow, because the build sandbox cannot reach Yahoo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import YahooFinance from "yahoo-finance2";

const client = new YahooFinance();
const yf = client as unknown as {
  _fetch: (url: string, params: Record<string, string>, opts: Record<string, unknown>, kind: string, crumb: boolean) => Promise<unknown>;
};

type Q = { label: string; field: "sector" | "industry"; value: string; exchange?: string };

const eq = (field: string, value: string) => ({ operator: "eq", operands: [field, value] });

async function screen(q: Q, size = 10): Promise<{ rows: Record<string, unknown>[]; total: unknown; error?: string; ms: number }> {
  const t0 = Date.now();
  const operands = [eq("region", "in"), eq(q.field, q.value)];
  if (q.exchange) operands.push(eq("exchange", q.exchange));
  const body = {
    offset: 0,
    size,
    sortField: "intradaymarketcap",
    sortType: "DESC",
    quoteType: "EQUITY",
    query: { operator: "AND", operands },
    userId: "",
    userIdType: "guid",
  };
  try {
    const res = (await yf._fetch(
      "https://${YF_QUERY_HOST}/v1/finance/screener",
      { lang: "en-US", region: "US", formatted: "false", corsDomain: "finance.yahoo.com" },
      { fetchOptions: { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } } },
      "json",
      true,
    )) as { finance?: { result?: { total?: number; quotes?: Record<string, unknown>[] }[] } };
    const r = res.finance?.result?.[0];
    return { rows: r?.quotes ?? [], total: r?.total, ms: Date.now() - t0 };
  } catch (e) {
    return { rows: [], total: null, error: (e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)).slice(0, 300), ms: Date.now() - t0 };
  }
}

const cr = (x: unknown) => (typeof x === "number" ? `₹${Math.round(x / 1e7).toLocaleString("en-IN")} cr` : "n/a");

const CASES: Q[] = [
  { label: "Industry: Banks - Regional (NSE)", field: "industry", value: "Banks - Regional", exchange: "NSI" },
  { label: "Industry: Banks - Diversified (NSE)", field: "industry", value: "Banks - Diversified", exchange: "NSI" },
  { label: "Industry: Information Technology Services (NSE)", field: "industry", value: "Information Technology Services", exchange: "NSI" },
  { label: "Industry: Drug Manufacturers - Specialty & Generic (NSE)", field: "industry", value: "Drug Manufacturers - Specialty & Generic", exchange: "NSI" },
  { label: "Industry: Auto Parts (NSE)", field: "industry", value: "Auto Parts", exchange: "NSI" },
  { label: "Sector: Financial Services (NSE)", field: "sector", value: "Financial Services", exchange: "NSI" },
  { label: "Sector: Technology (NSE)", field: "sector", value: "Technology", exchange: "NSI" },
  { label: "Sector: Healthcare (NSE)", field: "sector", value: "Healthcare", exchange: "NSI" },
  { label: "Industry: Banks - Regional (no exchange filter, to see NSE and BSE duplicates)", field: "industry", value: "Banks - Regional" },
  { label: "Not a real industry: 'Banks'", field: "industry", value: "Banks", exchange: "NSI" },
  { label: "Not a real sector: 'Banking'", field: "sector", value: "Banking", exchange: "NSI" },
];

async function main() {
  // The POST options would also be applied to the library's own cookie request and break it, so get the cookie and
  // crumb with an ordinary call first; the screener call then reuses them.
  await client.quote("RELIANCE.NS", {}, { validateResult: false }).catch((e) => console.error("warm-up failed:", e));
  const out: string[] = ["# Spike: top Indian stocks by sector or industry from Yahoo", "", `Run at ${new Date().toISOString()}`, ""];
  let worked = 0;
  for (const c of CASES) {
    const r = await screen(c);
    if (r.rows.length) worked++;
    out.push(`## ${c.label}`, "", `${r.rows.length} rows, total ${String(r.total)}, ${r.ms} ms${r.error ? `, ERROR: ${r.error}` : ""}`, "");
    if (r.rows.length) {
      out.push("| # | Symbol | Name | Market cap | Exchange | Sector | Industry |", "| --- | --- | --- | --- | --- | --- | --- |");
      r.rows.forEach((q, i) =>
        out.push(`| ${i + 1} | ${q.symbol} | ${q.longName ?? q.shortName ?? ""} | ${cr(q.marketCap)} | ${q.exchange ?? ""} | ${q.sector ?? q.sectorDisp ?? ""} | ${q.industry ?? q.industryDisp ?? ""} |`),
      );
      out.push("");
      out.push(`Fields on a row: ${Object.keys(r.rows[0]).join(", ")}`, "");
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  out.push(`**${worked} of ${CASES.length} queries returned rows.**`);
  mkdirSync("spike-out", { recursive: true });
  writeFileSync("spike-out/sector-report.md", out.join("\n") + "\n");
  console.log(out.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
