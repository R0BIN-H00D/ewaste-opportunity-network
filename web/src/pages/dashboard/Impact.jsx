import GlassCard from '../../components/glass/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ChartCard from '../../components/charts/ChartCard';
import { MonthlyBars } from '../../components/charts/Charts';
import { Tile } from '../../components/impact/Tiles';
import { useFetch } from '../../hooks/useFetch';
import { impactApi } from '../../services/impactApi';
import BarList from '../../components/impact/BarList';
import { kg, number } from '../../lib/analytics';
import { TYPE_LABEL, TYPE_ORDER, categoryItems, hasValues, monthlyColumns, monthlyRows, monthlyTable, typeSeries, yearlyItems } from '../../lib/impact';

/** A person's own impact. It counts only activity the other side confirmed as done. */
export default function ImpactDashboard() {
  const mine = useFetch((signal) => impactApi.mine(signal), []);
  const monthly = useFetch((signal) => impactApi.monthly({ scope: 'me', months: 12 }, signal), []);
  const yearly = useFetch((signal) => impactApi.yearly({ scope: 'me', years: 5 }, signal), []);
  const categories = useFetch((signal) => impactApi.byCategory({ scope: 'me' }, signal), []);

  const m = mine.data;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink dark:text-white">My impact</h1>

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="text-xl font-bold text-ink dark:text-white">What your activity has achieved</h2>
        {mine.loading && <Skeleton className="h-28" />}
        {mine.error && <ErrorState error={mine.error} onRetry={mine.reload} />}
        {m && m.devices.total === 0 && m.materials.measuredKg === 0 && m.materials.estimatedKg === 0 && (
          <GlassCard><p className="text-ink dark:text-[#E8F1EB]">Nothing yet. When a repair, donation, sale or recycling you take part in is confirmed as done, it is counted here.</p></GlassCard>
        )}
        {m && (m.devices.total > 0 || m.materials.measuredKg > 0 || m.materials.estimatedKg > 0) && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Tile label="Devices kept in use" value={number(m.devices.total)} kind="actual" />
              <Tile label="Weighed at recycling centres" value={kg(m.materials.measuredKg)} kind="measured" />
              <Tile label="Materials not weighed" value={kg(m.materials.estimatedKg)} kind="estimate" />
              <Tile label="CO₂ avoided, about" value={kg(m.co2e.kgEstimated)} kind="estimate" />
            </div>
            <ul className="flex flex-wrap gap-2 text-sm text-ink dark:text-[#E8F1EB]" aria-label="Devices by kind of activity">
              {TYPE_ORDER.filter((t) => m.devices.byType[t] > 0).map((t) => <li key={t} className="glass-subtle px-3 py-1">{TYPE_LABEL[t]} {m.devices.byType[t]}</li>)}
            </ul>
            <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{m.method}</p>
          </>
        )}
      </section>

      {monthly.data && monthly.data.months.some((x) => x.devices > 0) && (
        <ChartCard title="Month by month" summary="Devices kept in use each month: counts of confirmed activity." legend={typeSeries} columns={monthlyColumns} rows={monthlyTable(monthly.data.months)} height={260}>
          <MonthlyBars data={monthlyRows(monthly.data.months)} series={typeSeries} stacked />
        </ChartCard>
      )}

      {yearly.data && hasValues(yearlyItems(yearly.data.years)) && <BarList title="Year by year" summary="Devices kept in use each year: counts of confirmed activity." items={yearlyItems(yearly.data.years)} />}
      {categories.data && hasValues(categoryItems(categories.data.categories)) && <BarList title="By kind of device" summary="Which devices your confirmed activity was about." items={categoryItems(categories.data.categories)} />}
    </div>
  );
}
