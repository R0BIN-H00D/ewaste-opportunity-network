import { useSearchParams } from 'react-router-dom';
import GlassCard from '../../components/glass/GlassCard';
import ChartCard from '../../components/charts/ChartCard';
import { CategoryBars, MonthlyBars, MonthlyLines } from '../../components/charts/Charts';
import ExportPanel from '../../components/admin/ExportPanel';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminAnalyticsApi } from '../../services/adminApi';
import { SERVICE_LABEL, SERVICE_ORDER, kg, monthLabel, number, percent } from '../../lib/analytics';

const PERIODS = [3, 6, 12, 24];
const C = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)']; // always assigned in this order, never cycled
const month = (m) => monthLabel(m, 'long');

function Stat({ label, value, hint }) {
  return (
    <li className="glass p-4">
      <p className="text-sm font-semibold text-ink dark:text-white">{label}</p>
      <p className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{hint}</p>}
    </li>
  );
}

function Section({ title, children }) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function Skeletons() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-80 w-full !rounded-3xl" />)}</div>
    </div>
  );
}

/** How the platform is growing and being used, month by month. Every chart has the same numbers as a table. */
export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const asked = Number(params.get('months'));
  const months = PERIODS.includes(asked) ? asked : 12;
  const { data: d, error, loading, reload } = useFetch((signal) => adminAnalyticsApi.get({ months }, signal), [months]);

  const setMonths = (e) => setParams(e.target.value === '12' ? {} : { months: e.target.value });

  let body;
  if (error) body = <ErrorState error={error} onRetry={reload} title="Could not load the analytics" />;
  else if (loading && !d) body = <Skeletons />;
  else if (d) {
    const reg = d.registrations;
    const people = d.growth[d.growth.length - 1]?.total || 0;
    const before = (d.growth[0]?.total || 0) - (reg.series[0]?.total || 0);
    const started = SERVICE_ORDER.reduce((n, k) => n + d.services[k].created, 0);
    const completed = SERVICE_ORDER.reduce((n, k) => n + d.services[k].completed, 0);
    const span = `in the last ${months} months`;
    const catHeight = Math.max(180, d.categories.length * 38 + 40);

    body = (
      <>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Headline numbers">
          <Stat label="New sign-ups" value={number(reg.total)} hint={span} />
          <Stat label="People on the platform" value={number(people)} hint="Members and providers, not administrators" />
          <Stat label="Services completed" value={number(completed)} hint={`of ${number(started)} started ${span}`} />
          <Stat label="Devices recycled" value={number(d.recycling.devices)} hint={`${span}, completed requests only`} />
        </ul>

        <Section title="People">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="New sign-ups by month"
              summary={`${number(reg.total)} people joined ${span}: ${number(reg.series.reduce((n, s) => n + s.members, 0))} members and ${number(reg.series.reduce((n, s) => n + s.providers, 0))} providers.`}
              legend={[{ key: 'members', name: 'Members', color: C[0] }, { key: 'providers', name: 'Providers', color: C[1] }]}
              columns={['Month', 'Members', 'Providers', 'Total']}
              rows={reg.series.map((s) => [month(s.month), s.members, s.providers, s.total])}
            >
              <MonthlyBars data={reg.series} stacked series={[{ key: 'members', name: 'Members', color: C[0] }, { key: 'providers', name: 'Providers', color: C[1] }]} />
            </ChartCard>
            <ChartCard
              title="Platform growth"
              summary={`${number(people)} people now, from ${number(before)} before ${monthLabel(d.period.from, 'long')}.`}
              columns={['Month', 'People on the platform']}
              rows={d.growth.map((g) => [month(g.month), g.total])}
            >
              <MonthlyLines data={d.growth} series={[{ key: 'total', name: 'People', color: C[0] }]} />
            </ChartCard>
          </div>
        </Section>

        <Section title="Services">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              className="lg:col-span-2"
              title="Services started by month"
              summary={`${number(started)} started ${span}, ${number(completed)} of them completed so far.`}
              legend={SERVICE_ORDER.map((k, i) => ({ key: k, name: SERVICE_LABEL[k], color: C[i] }))}
              columns={['Month', ...SERVICE_ORDER.map((k) => SERVICE_LABEL[k])]}
              rows={d.activity.map((a) => [month(a.month), ...SERVICE_ORDER.map((k) => a[k])])}
            >
              <MonthlyLines data={d.activity} series={SERVICE_ORDER.map((k, i) => ({ key: k, name: SERVICE_LABEL[k], color: C[i] }))} />
            </ChartCard>
            <ChartCard
              title="Donations by month"
              summary={`${number(d.donations.offered)} offered, ${number(d.donations.completed)} completed (${percent(d.donations.completed, d.donations.offered)}).`}
              legend={[{ key: 'offered', name: 'Offered', color: C[0] }, { key: 'completed', name: 'Completed', color: C[1] }]}
              columns={['Month', 'Offered', 'Completed']}
              rows={d.donations.series.map((s) => [month(s.month), s.offered, s.completed])}
            >
              <MonthlyBars data={d.donations.series} series={[{ key: 'offered', name: 'Offered', color: C[0] }, { key: 'completed', name: 'Completed', color: C[1] }]} />
            </ChartCard>
            <ChartCard
              title="Recycling requests by month"
              summary={`${number(d.recycling.requests)} requested, ${number(d.recycling.completed)} completed (${percent(d.recycling.completed, d.recycling.requests)}), ${number(d.recycling.devices)} devices recycled.`}
              legend={[{ key: 'requests', name: 'Requested', color: C[0] }, { key: 'completed', name: 'Completed', color: C[1] }]}
              columns={['Month', 'Requested', 'Completed']}
              rows={d.recycling.series.map((s) => [month(s.month), s.requests, s.completed])}
            >
              <MonthlyBars data={d.recycling.series} series={[{ key: 'requests', name: 'Requested', color: C[0] }, { key: 'completed', name: 'Completed', color: C[1] }]} />
            </ChartCard>
          </div>

          <GlassCard as="div" className="overflow-x-auto" tabIndex={0} role="region" aria-label="Completion rate by service">
            <table className="w-full text-left text-sm text-ink dark:text-[#E8F1EB]">
              <caption className="pb-2 text-left text-base font-bold text-ink dark:text-white">How many services reach the end {span}</caption>
              <thead>
                <tr className="border-b border-black/10 dark:border-white/15">
                  <th scope="col" className="py-2 pr-4 font-semibold">Service</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Started</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Completed</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Completion rate</th>
                </tr>
              </thead>
              <tbody>
                {SERVICE_ORDER.map((k) => (
                  <tr key={k} className="border-b border-black/5 dark:border-white/10">
                    <th scope="row" className="py-1.5 pr-4 font-medium">{SERVICE_LABEL[k]}</th>
                    <td className="font-numeric py-1.5 pr-4">{number(d.services[k].created)}</td>
                    <td className="font-numeric py-1.5 pr-4">{number(d.services[k].completed)}</td>
                    <td className="font-numeric py-1.5 pr-4">{percent(d.services[k].completed, d.services[k].created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </Section>

        <Section title="Listings">
          {d.categories.length === 0 ? (
            <GlassCard><p className="text-sm text-ink dark:text-[#E8F1EB]">No devices were listed {span}.</p></GlassCard>
          ) : (
            <ChartCard
              title="Devices listed by category"
              summary={`${number(d.categories.reduce((n, c) => n + c.count, 0))} listings ${span}, most common first. Drafts and removed listings are not counted.`}
              height={catHeight}
              columns={['Category', 'Listings']}
              rows={d.categories.map((c) => [c.name, c.count])}
            >
              <CategoryBars data={d.categories} />
            </ChartCard>
          )}
        </Section>

        <Section title="Verified environmental impact">
          <GlassCard className="space-y-3">
            <p className="text-sm text-ink dark:text-[#E8F1EB]">
              Only events that were verified and not reversed count. Weighed and estimated amounts are kept apart and never added together, and CO₂e is always an estimate.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Verified events', number(d.impact.events)],
                ['Devices', number(d.impact.devices)],
                ['Weighed materials', kg(d.impact.weighedKg)],
                ['Estimated materials', kg(d.impact.estimatedKg)],
                ['CO₂e (estimate)', kg(d.impact.co2eEstimateKg)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
                  <dd className="font-numeric text-xl font-bold text-ink dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </GlassCard>
        </Section>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Analytics</h1>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">How the platform is growing and being used. Months are calendar months (UTC).</p>
        </div>
        <TextField as="select" label="Period" value={String(months)} onChange={setMonths} className="w-48">
          {PERIODS.map((p) => <option key={p} value={p}>Last {p} months</option>)}
        </TextField>
      </div>
      <div className={loading && d ? 'opacity-60' : ''} aria-live="polite">{body}</div>
      <ExportPanel />
    </div>
  );
}
