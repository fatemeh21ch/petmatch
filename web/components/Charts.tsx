"use client";
// Small dependency-free SVG charts. Time runs right-to-left like the text (newest day on the left).
import { useState } from "react";
import { fa, shortDate } from "@/lib/format";

type Series = { label: string; color: string; values: number[]; kind: "bar" | "line" | "area" };

export function TimeChart({ dates, series, height = 230, yFormat = (v: number) => fa(Math.round(v)) }:
  { dates: string[]; series: Series[]; height?: number; yFormat?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = height, pad = { l: 12, r: 52, t: 14, b: 28 };
  const n = dates.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.08;
  const step = (W - pad.l - pad.r) / n;
  const x = (i: number) => W - pad.r - (i + 0.5) * step;           // i=0 oldest → right side
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const bars = series.filter((s) => s.kind === "bar");
  const bw = Math.max(3, (step * 0.7) / Math.max(1, bars.length));
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ direction: "ltr" }} role="img"
        aria-label={series.map((s) => s.label).join("، ")} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * t / 1.08)} y2={y(max * t / 1.08)} stroke="#e6edf0" strokeDasharray="3 5" />
            <text x={W - pad.r + 6} y={y(max * t / 1.08) + 4} fontSize="11" fill="#84979e">{yFormat(max * t / 1.08)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          if (s.kind === "bar") {
            const bi = bars.indexOf(s);
            return <g key={si}>{s.values.map((v, i) => (
              <rect key={i} x={x(i) - (bw * bars.length) / 2 + bi * bw} y={y(v)} width={bw - 1} height={Math.max(0, H - pad.b - y(v))}
                rx="2" fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />
            ))}</g>;
          }
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          return (
            <g key={si}>
              {s.kind === "area" && <path d={`M${x(0)},${H - pad.b} L${pts.join(" L")} L${x(n - 1)},${H - pad.b} Z`} fill={s.color} opacity=".15" />}
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" />
              {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />}
            </g>
          );
        })}
        {[0, Math.floor(n / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize="11" fill="#84979e" textAnchor="middle">{i === n - 1 ? "امروز" : shortDate(dates[i])}</text>
        ))}
        {dates.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={0} width={step} height={H - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#12333f" strokeOpacity=".15" />}
      </svg>
      {hover !== null && (
        <div style={{ position: "absolute", top: 4, left: 8, background: "#fff", border: "1px solid var(--line)", borderRadius: 10,
          padding: "4px 10px", fontSize: 12.5, boxShadow: "var(--shadow)", pointerEvents: "none" }}>
          <b>{hover === n - 1 ? "امروز" : shortDate(dates[hover])}</b>
          {series.map((s) => <div key={s.label}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: s.color, marginLeft: 5 }} />{s.label}: {yFormat(s.values[hover])}</div>)}
        </div>
      )}
      <div className="legend-row">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>
    </div>
  );
}

export function HBars({ rows, format = (v: number) => fa(v) }: { rows: { label: string; value: number; color?: string; note?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label} title={r.note}>
          <span>{r.label}</span>
          <div className="t"><div className="f" style={{ width: `${(r.value / max) * 100}%`, background: r.color || "var(--brand)" }} /></div>
          <b>{format(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

const PALETTE = ["#13566c", "#f4c542", "#4f9ac2", "#e8579b", "#2e9b62", "#e0892b", "#6b5bd1", "#9aa7ad"];

export function Donut({ rows, center, size = 170 }: { rows: { label: string; count: number }[]; center?: string; size?: number }) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  const R = 60, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={rows.map((r) => `${r.label} ${r.count}`).join("، ")}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="#eef3f5" strokeWidth="22" />
        {rows.map((r, i) => {
          const len = (r.count / total) * C;
          const el = <circle key={r.label} cx="80" cy="80" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="22"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />;
          acc += len;
          return el;
        })}
        <text x="80" y="78" textAnchor="middle" fontSize="22" fontWeight="800" fill="#12333f">{center ?? fa(total)}</text>
        <text x="80" y="98" textAnchor="middle" fontSize="11" fill="#84979e">مجموع</text>
      </svg>
      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        {rows.map((r, i) => (
          <div key={r.label}><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: PALETTE[i % PALETTE.length], marginLeft: 6 }} />
            {r.label}: <b>{fa(r.count)}</b> <span className="muted">({fa(Math.round((r.count / total) * 100))}٪)</span></div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "#13566c", w = 90, h = 30 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(w - (i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / (max - min || 1)) * (h - 4)).toFixed(1)}`);
  return <svg width={w} height={h} style={{ direction: "ltr" }} aria-hidden="true"><polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /></svg>;
}

export function PriceChart({ hist }: { hist: [string, number][] }) {
  return <TimeChart dates={hist.map((h) => h[0])} series={[{ label: "کمترین قیمت روز (تومان)", color: "#13566c", values: hist.map((h) => h[1]), kind: "area" }]}
    yFormat={(v) => `${fa(+(v / 1e6).toFixed(2))}م`} />;
}
