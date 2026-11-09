"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  LabelList,
} from "recharts";
import type { Verdict } from "@/lib/screen";
import { fmtCr, fmtPct } from "./format";

const axis = { stroke: "var(--muted)", fontSize: 11 } as const;

export function ProfitBars({ labels, values }: { labels: string[]; values: (number | null)[] }) {
  const data = labels.map((l, i) => ({ label: l, value: values[i] }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={axis} stroke="var(--line)" />
        <YAxis tick={axis} stroke="var(--line)" width={52} tickFormatter={(v: number) => fmtCr(v)} />
        <ReferenceLine y={0} stroke="var(--muted)" />
        <Tooltip
          formatter={(v) => ["₹" + fmtCr(Number(v)) + " Cr", "Net profit"]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={(d.value ?? 0) < 0 ? "var(--bad)" : "var(--accent)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RoceLine({ labels, values }: { labels: string[]; values: (number | null)[] }) {
  const data = labels.map((l, i) => ({ label: l, value: values[i] }));
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tick={axis} stroke="var(--line)" />
        <YAxis tick={axis} stroke="var(--line)" width={44} tickFormatter={(v: number) => fmtPct(v, 0)} />
        <Tooltip
          formatter={(v) => [fmtPct(Number(v)), "ROCE"]}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }}
        />
        <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

type Pt = { symbol: string; roe: number; roce: number; verdict: Verdict };

const verdictColour: Record<Verdict, string> = {
  "CONSIDER – Strong": "var(--good)",
  "CONSIDER – Moderate": "var(--warn)",
  SKIP: "var(--bad)",
  "n/a": "var(--muted)",
};

export function RoeRoceScatter({
  points,
  roeBench,
  roceBench,
  onPick,
}: {
  points: Pt[];
  roeBench: number | null;
  roceBench: number | null;
  onPick: (symbol: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 16 }}>
        <CartesianGrid stroke="var(--line)" />
        <XAxis
          type="number"
          dataKey="roe"
          name="ROE"
          tick={axis}
          stroke="var(--line)"
          tickFormatter={(v: number) => fmtPct(v, 0)}
          label={{ value: "ROE", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="roce"
          name="ROCE"
          tick={axis}
          stroke="var(--line)"
          width={44}
          tickFormatter={(v: number) => fmtPct(v, 0)}
        />
        <ZAxis range={[70, 70]} />
        {roeBench != null && <ReferenceLine x={roeBench} stroke="var(--muted)" strokeDasharray="4 4" />}
        {roceBench != null && <ReferenceLine y={roceBench} stroke="var(--muted)" strokeDasharray="4 4" />}
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(v, n) => [fmtPct(Number(v)), String(n)]}
          labelFormatter={() => ""}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }}
        />
        <Scatter data={points} onClick={(p) => p && onPick((p as unknown as Pt).symbol)} cursor="pointer" isAnimationActive={false}>
          {points.map((p, i) => (
            <Cell key={i} fill={verdictColour[p.verdict]} />
          ))}
          <LabelList dataKey="symbol" position="top" fill="var(--muted)" fontSize={10} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
