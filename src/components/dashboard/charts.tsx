// Small server-rendered SVG charts. No chart library: fewer dependencies, no client JS, and they follow the theme tokens.

/** Rounds `max` up to a tidy axis ceiling and returns evenly spaced ticks (cents). An empty chart still gets a $100 axis, so the ticks are always distinct. */
export function niceTicks(max: number, count = 4): number[] {
  const raw = Math.max(max, 10_000) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}

const compact = (cents: number) => {
  const d = cents / 100;
  return d >= 1000 ? `$${+(d / 1000).toFixed(1)}k` : `$${Math.round(d)}`;
};

type Frame = { w: number; h: number; l: number; r: number; t: number; b: number };
const F: Frame = { w: 720, h: 260, l: 48, r: 12, t: 12, b: 28 };
const FDEFAULT = F;
const FW: Frame = { ...F, w: 1100, h: 280 };

function Grid({ ticks, top, F = FDEFAULT }: { ticks: number[]; top: number; F?: Frame }) {
  const ih = F.h - F.t - F.b;
  return (
    <>
      {ticks.map((v, i) => {
        const y = F.t + ih - (v / top) * ih;
        return (
          <g key={i}>
            <line x1={F.l} x2={F.w - F.r} y1={y} y2={y} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={F.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--fg-muted)">{compact(v)}</text>
          </g>
        );
      })}
    </>
  );
}

export function BarChart({ labels, values, valueLabels, title }: { labels: string[]; values: number[]; valueLabels: string[]; title: string }) {
  const ticks = niceTicks(Math.max(...values));
  const top = ticks[ticks.length - 1] || 1;
  const iw = F.w - F.l - F.r, ih = F.h - F.t - F.b;
  const slot = iw / values.length;
  const bw = Math.min(34, slot * 0.58);
  return (
    <svg viewBox={`0 0 ${F.w} ${F.h}`} role="img" aria-label={title} className="h-auto w-full min-w-[560px]">
      <Grid ticks={ticks} top={top} />
      {values.map((v, i) => {
        const h = (v / top) * ih;
        const x = F.l + slot * i + (slot - bw) / 2;
        return (
          <g key={labels[i]}>
            <rect x={x} y={F.t + ih - h} width={bw} height={Math.max(h, v > 0 ? 2 : 0)} rx="5" fill="var(--primary)"><title>{`${labels[i]}: ${valueLabels[i]}`}</title></rect>
            <text x={x + bw / 2} y={F.h - 8} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ labels, series, title }: { labels: string[]; series: { name: string; color: string; values: number[]; formatted: string[] }[]; title: string }) {
  const F = FW;
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1] || 1;
  const iw = F.w - F.l - F.r, ih = F.h - F.t - F.b;
  const x = (i: number) => F.l + (iw * i) / Math.max(labels.length - 1, 1);
  const y = (v: number) => F.t + ih - (v / top) * ih;
  return (
    <svg viewBox={`0 0 ${F.w} ${F.h}`} role="img" aria-label={title} className="h-auto w-full min-w-[860px]">
      <Grid ticks={ticks} top={top} F={F} />
      {labels.map((l, i) => (i % 2 === 0 || labels.length < 8) && <text key={l} x={x(i)} y={F.h - 8} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">{l}</text>)}
      {series.map((s) => (
        <g key={s.name}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--surface)" stroke={s.color} strokeWidth="2"><title>{`${s.name} · ${labels[i]}: ${s.formatted[i]}`}</title></circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function Donut({ slices, title, centerLabel }: { slices: { label: string; value: number; color: string }[]; title: string; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={title} className="mx-auto h-44 w-44">
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
      {total > 0 && slices.filter((s) => s.value > 0).map((s) => {
        const len = (s.value / total) * C;
        const el = (
          <circle key={s.label} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth="26"
            strokeDasharray={`${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)">
            <title>{`${s.label}: ${Math.round((s.value / total) * 100)}%`}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      <text x="100" y="106" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--fg)">{centerLabel}</text>
    </svg>
  );
}
