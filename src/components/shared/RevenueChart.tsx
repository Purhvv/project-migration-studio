import { useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkplaces } from "@/data/queries";
import { workplaceRevenueSeries } from "@/lib/revenue";
import type { Shift } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { WorkplaceDot, wpColor } from "@/components/shifts/shift-ui";
import { Money, Panel } from "./primitives";

export function RevenueChart({ shifts, selected, monthly }: { shifts: Shift[]; selected: string; monthly: boolean }) {
  const { data: workplaces } = useWorkplaces();
  const visible = (workplaces ?? []).filter((w) => selected === "all" || w.id === selected);
  const data = useMemo(() => workplaceRevenueSeries(shifts, workplaces ?? [], monthly, selected), [shifts, workplaces, monthly, selected]);
  const [key, setKey] = useState<string | null>(null);
  const detail = data.find((r) => r.key === key);
  const values = (row: typeof data[number]) => <div className="space-y-2">{row.details.map(({ workplace, revenue }) => <div key={workplace.id} className="flex flex-wrap justify-between gap-2 text-xs"><span className="flex items-center gap-1.5"><WorkplaceDot color={workplace.color} />{workplace.name}</span><Money value={revenue.value} partial={revenue.partial} /></div>)}</div>;
  return <Panel className="p-3"><div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{visible.map((w) => <span key={w.id} className="flex items-center gap-1.5"><WorkplaceDot color={w.color} />{w.name}</span>)}</div>
    {data.length ? <div className="overflow-x-auto"><div style={{ width: Math.max(300, data.length * 115), minWidth: "100%" }}><ResponsiveContainer width="100%" height={230}><LineChart data={data} margin={{ top: 20, right: 25, bottom: 5, left: 0 }} onClick={(event) => { const value = event?.activePayload?.[0]?.payload.key; if (typeof value === "string") setKey(value); }}>
      <XAxis dataKey="label" interval={0} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} /><YAxis width={65} tickFormatter={(v) => formatNumber(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
      <Tooltip trigger="click" content={({ active, payload }) => { const row = payload?.[0]?.payload as typeof data[number] | undefined; return active && row ? <div className="max-w-72 space-y-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-card"><p className="text-xs font-semibold">{row.label}</p>{values(row)}</div> : null; }} />
      {visible.map((w, i) => <Line key={w.id} dataKey={`workplace${i}`} name={w.name} stroke={wpColor(w.color)} strokeWidth={2} strokeDasharray={i % 2 ? "5 3" : undefined} dot={{ r: 4 }} type="linear" connectNulls={false} isAnimationActive={false} />)}
    </LineChart></ResponsiveContainer></div></div> : <p className="py-3 text-sm text-muted-foreground">Нет данных за выбранный период</p>}
    {detail && <div role="status" className="mt-3 space-y-2 border-t pt-3"><p className="text-sm font-medium">{detail.label}</p>{values(detail)}</div>}
    {!!data.length && <details className="mt-3"><summary className="cursor-pointer text-sm text-primary">Значения за период</summary><div className="divide-y">{data.map((row) => <div key={row.key} className="space-y-2 py-2"><Button variant="ghost" className="h-8 px-0 text-xs" onClick={() => setKey(row.key)}>{row.label}</Button>{values(row)}</div>)}</div></details>}
  </Panel>;
}