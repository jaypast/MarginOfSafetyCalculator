// Regenerates server/data/russell3000.ts — the static Russell 3000-style
// universe (top 3,000 U.S.-listed common stocks by market cap).
//
// Usage:
//   npx tsx scripts/build-russell3000.ts                # fetch live Nasdaq screener
//   npx tsx scripts/build-russell3000.ts /path/raw.json # use a cached screener dump
//
// The screener payload shape is { data: { rows: [{ symbol, name, marketCap,
// country, ... }] } }. Filtering rules live in server/data/universeFilters.ts
// and are enforced again by tests/russell3000.test.ts, so a regeneration with
// broken filters fails the test suite instead of shipping bad constituents.

import { readFileSync, writeFileSync } from "fs";
import {
  isLikelyCommonStockName,
  cleanCompanyName,
  normalizeCompanyKey,
  VALID_SYMBOL_PATTERN,
} from "../server/data/universeFilters";

const SCREENER_URL =
  "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&offset=0&download=true";

interface ScreenerRow {
  symbol: string;
  name: string;
  marketCap: string;
  country: string;
}

async function loadRows(): Promise<ScreenerRow[]> {
  const fileArg = process.argv[2];
  let payload: any;
  if (fileArg) {
    console.log(`Reading cached screener dump: ${fileArg}`);
    payload = JSON.parse(readFileSync(fileArg, "utf8"));
  } else {
    console.log(`Fetching ${SCREENER_URL}`);
    const res = await fetch(SCREENER_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nasdaq screener HTTP ${res.status}`);
    payload = await res.json();
  }
  const rows: ScreenerRow[] = payload?.data?.rows ?? payload?.data?.table?.rows;
  if (!Array.isArray(rows) || rows.length < 4000) {
    throw new Error(
      `Screener payload looks wrong (rows=${Array.isArray(rows) ? rows.length : "none"})`,
    );
  }
  return rows;
}

async function main() {
  const rows = await loadRows();
  console.log(`Screener rows: ${rows.length}`);

  const candidates = rows
    .filter(
      (r) =>
        r.country === "United States" &&
        typeof r.symbol === "string" &&
        VALID_SYMBOL_PATTERN.test(r.symbol) &&
        typeof r.name === "string" &&
        isLikelyCommonStockName(r.name) &&
        parseFloat(r.marketCap) > 0,
    )
    .sort((a, b) => parseFloat(b.marketCap) - parseFloat(a.marketCap));
  console.log(`After common-stock filters: ${candidates.length}`);

  // One share class per company (keep the largest-cap class).
  const seen = new Set<string>();
  const out: { symbol: string; name: string }[] = [];
  for (const r of candidates) {
    const key = normalizeCompanyKey(r.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ symbol: r.symbol, name: cleanCompanyName(r.name) });
    if (out.length === 3000) break;
  }
  if (out.length < 3000) {
    throw new Error(`Only ${out.length} constituents after filtering — refusing to write.`);
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const lines = out.map(
    (e) => `  { symbol: ${JSON.stringify(e.symbol)}, name: ${JSON.stringify(e.name)} },`,
  );
  const file = [
    "// Russell 3000 universe — static reconstruction for the emailed research report.",
    "//",
    "// FTSE Russell does not publish the constituent list freely, so this dataset",
    "// reconstructs it the same way the index is built: the top 3,000 U.S.-listed",
    "// common stocks ranked by market capitalization (Nasdaq screener universe,",
    "// one share class per company; notes/bonds/debentures/preferreds/funds/",
    "// warrants/rights/units/depositary shares excluded — see",
    "// server/data/universeFilters.ts, enforced by tests/russell3000.test.ts).",
    "//",
    "// Regenerate with: npx tsx scripts/build-russell3000.ts",
    "//",
    `// AS-OF DATE: ${asOf} — surfaced in the report CSV so recipients can`,
    "// judge staleness. Live refresh of constituents is intentionally out of scope.",
    "",
    `export const RUSSELL_3000_AS_OF = ${JSON.stringify(asOf)};`,
    "",
    "export interface Russell3000Entry {",
    "  symbol: string;",
    "  name: string;",
    "}",
    "",
    "export const RUSSELL_3000: Russell3000Entry[] = [",
    ...lines,
    "];",
    "",
  ].join("\n");

  writeFileSync("server/data/russell3000.ts", file);
  console.log(
    `Wrote server/data/russell3000.ts — ${out.length} constituents, as of ${asOf}`,
  );
  console.log(`Top 5: ${out.slice(0, 5).map((e) => e.symbol).join(", ")}`);
  console.log(`Smallest kept: ${out[out.length - 1].symbol} (${out[out.length - 1].name})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
