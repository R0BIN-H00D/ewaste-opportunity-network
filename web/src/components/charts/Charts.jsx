import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthLabel, number } from '../../lib/analytics';

// Colours come from CSS variables (see index.css), so one set of charts follows the light and dark themes. Marks are thin, the
// grid and axes stay quiet, and text wears the text colour, never the series colour.
const tick = { fill: 'var(--viz-text)', fontSize: 12 };
const quiet = { stroke: 'var(--viz-grid)' };
const margin = { top: 8, right: 28, left: 0, bottom: 0 };

/** The hover card: the label, then one row per series with its swatch and value. */
function ChartTooltip({ active, payload, label, title }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="viz-root rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-e1 dark:border-white/15 dark:bg-[#12241c]">
      <p className="mb-1 font-semibold text-ink dark:text-white">{title ? title(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink dark:text-[#E8F1EB]">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-numeric font-semibold">{number(p.value)}</span>
        </p>
      ))}
    </div>
  );
}
const monthTitle = (m) => monthLabel(m, 'long');
/** About four evenly spaced labels (so they fit a phone), counted back from the latest month so the newest is always named. */
const monthTicks = (data) => {
  const step = Math.max(1, Math.ceil(data.length / 4));
  return data.filter((_, i) => (data.length - 1 - i) % step === 0).map((d) => d.month);
};
const monthAxis = (data) => <XAxis dataKey="month" ticks={monthTicks(data)} interval={0} tickFormatter={(m) => monthLabel(m)} tick={tick} tickLine={false} axisLine={quiet} />;
const countAxis = <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={36} />;

/**
 * Bars by month. `stacked` puts the series on top of each other with a 2px gap of the surface colour between segments, and only
 * the top segment gets the rounded end; unstacked bars sit side by side.
 * @param series [{ key, name, color }]
 */
export function MonthlyBars({ data, series, stacked = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={margin} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        {monthAxis(data)}
        {countAxis}
        <Tooltip content={<ChartTooltip title={monthTitle} />} cursor={{ fill: 'var(--viz-grid)' }} />
        {series.map((s, i) => (
          <Bar
            key={s.key} dataKey={s.key} name={s.name} fill={s.color} isAnimationActive={false}
            stackId={stacked ? 'stack' : undefined}
            stroke={stacked ? 'var(--viz-surface)' : undefined} strokeWidth={stacked ? 2 : 0}
            radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Lines by month: 2px strokes, a marker on every point while there are few enough to tell apart, the hover card on every point. */
export function MonthlyLines({ data, series }) {
  const markers = data.length <= 12;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        {monthAxis(data)}
        {countAxis}
        <Tooltip content={<ChartTooltip title={monthTitle} />} cursor={quiet} />
        {series.map((s) => (
          <Line
            key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} isAnimationActive={false}
            dot={markers ? { r: 4, fill: s.color, stroke: 'var(--viz-surface)', strokeWidth: 2 } : false}
            activeDot={{ r: 5, fill: s.color, stroke: 'var(--viz-surface)', strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** One bar per category, longest first, with the number written at the end of each bar. A single series needs no legend. */
export function CategoryBars({ data, name = 'Listings' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
        <XAxis type="number" allowDecimals={false} tick={tick} tickLine={false} axisLine={quiet} />
        <YAxis type="category" dataKey="name" width={150} tick={tick} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--viz-grid)' }} />
        <Bar dataKey="count" name={name} fill="var(--viz-1)" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="count" position="right" fill="var(--viz-text)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
