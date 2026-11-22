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
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
