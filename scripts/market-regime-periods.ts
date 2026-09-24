export const CYCLE_PERIODS = [
  { label: "Dot-com bust", start: "2000-01", end: "2002-12" },
  { label: "Pre-crisis expansion", start: "2003-01", end: "2007-12" },
  { label: "Financial crisis", start: "2008-01", end: "2009-12" },
  { label: "Post-crisis recovery", start: "2010-01", end: "2012-12" },
  { label: "Long low-volatility expansion", start: "2013-01", end: "2017-12" },
  { label: "Late-cycle turbulence", start: "2018-01", end: "2019-12" },
  { label: "2020 shock and recovery", start: "2020-01", end: "2021-12" },
  { label: "Inflation and recent period", start: "2022-01", end: "2025-08" },
] as const;

/** Fail closed if a warm-up or a period edit drops any intended forecast month. */
export function assertCycleCoverage(forecastDates: string[]): void {
  const expected: string[] = [];
  for (const period of CYCLE_PERIODS) {
    let [year, month] = period.start.split("-").map(Number);
    while (`${year}-${String(month).padStart(2, "0")}` <= period.end) {
      expected.push(`${year}-${String(month).padStart(2, "0")}`);
      month += 1;
      if (month === 13) { year += 1; month = 1; }
    }
  }
  const actual = forecastDates.map((date) => date.slice(0, 7));
  if (actual.length !== expected.length || actual.some((month, index) => month !== expected[index])) {
    throw new Error(`Long-cycle forecast months must cover ${expected[0]} through ${expected.at(-1)} without gaps; got ${actual[0]} through ${actual.at(-1)} (${actual.length} months)`);
  }
}