const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCr = (x: number | null | undefined) => (x == null ? "–" : inr.format(x));
export const fmtPrice = (x: number | null | undefined) => (x == null ? "–" : inr2.format(x));
export const fmtPct = (x: number | null | undefined, d = 1) => (x == null ? "–" : (x * 100).toFixed(d) + "%");
export const fmtX = (x: number | null | undefined) => (x == null ? "n/m" : x.toFixed(1) + "x");
