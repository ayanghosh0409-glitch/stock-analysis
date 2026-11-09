export default function Sparkline({ values }: { values: (number | null)[] | null }) {
  const v = (values ?? []).map((x) => (typeof x === "number" ? x : null));
  const nums = v.filter((x): x is number => x !== null);
  if (nums.length < 2) return <span className="text-muted">–</span>;
  const lo = Math.min(...nums, 0);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const w = 64;
  const h = 22;
  const pts = v.map((x, i) =>
    x === null ? null : [(i / (v.length - 1)) * w, h - 2 - ((x - lo) / span) * (h - 4)] as const,
  );
  const path = pts
    .filter((p): p is readonly [number, number] => p !== null)
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const up = nums[nums.length - 1] >= nums[0];
  return (
    <svg width={w} height={h} role="img" aria-label="Net profit trend, oldest to newest">
      <path d={path} fill="none" stroke={up ? "var(--good)" : "var(--bad)"} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  );
}
