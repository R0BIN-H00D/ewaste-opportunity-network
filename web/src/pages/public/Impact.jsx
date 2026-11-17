import { Sprout } from 'lucide-react';
import PageShell from '../../components/layout/PageShell';
import GlassCard from '../../components/glass/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ChartCard from '../../components/charts/ChartCard';
import { MonthlyBars } from '../../components/charts/Charts';
import { Tile } from '../../components/impact/Tiles';
import RulesList from '../../components/impact/RulesList';
import { useFetch } from '../../hooks/useFetch';
import { impactApi } from '../../services/impactApi';
import BarList from '../../components/impact/BarList';
import { kg, number } from '../../lib/analytics';
import { TYPE_ORDER, categoryItems, hasValues, monthlyColumns, monthlyRows, monthlyTable, typeSeries, yearlyItems } from '../../lib/impact';

/**
 * What the platform has achieved. Every figure comes from recorded, verified activity (FR-IMP-006), counted devices are marked
 * Actual, weights on a scale Measured, and anything worked out from a factor is marked Estimate (FR-IMP-005, BR-06).
 */
export default function ImpactPage() {
  const platform = useFetch((signal) => impactApi.platform(signal), []);
  const monthly = useFetch((signal) => impactApi.monthly({ months: 12 }, signal), []);
  const yearly = useFetch((signal) => impactApi.yearly({ years: 5 }, signal), []);
  const categories = useFetch((signal) => impactApi.byCategory({}, signal), []);
  const d = platform.data;

  return (
    <PageShell wide title="Environmental impact" intro="Our numbers come from recorded activity that the other person has confirmed. A figure is marked Actual when it is a count, Measured when it was weighed on a scale, and Estimate when it is worked out.">
      {platform.loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {platform.error && <ErrorState error={platform.error} onRetry={platform.reload} title="The figures are unavailable right now" />}

      {d && d.verifiedActivities === 0 && (
        <GlassCard className="text-center">
          <Sprout size={32} aria-hidden className="mx-auto text-secondary-strong dark:text-primary-tint" />
          <h2 className="mt-2 text-lg font-bold text-ink dark:text-white">No verified activity yet</h2>
          <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Figures appear here as repairs, donations, sales and recycling are confirmed as done. {number(d.devicesListed)} devices have been listed so far.</p>
        </GlassCard>
      )}

      {d && d.verifiedActivities > 0 && (
        <>
          <section aria-labelledby="devices-h" className="space-y-3">
            <h2 id="devices-h" className="text-xl font-bold text-ink dark:text-white">Devices kept in use</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Devices kept out of the waste stream" value={number(d.devices.diverted)} kind="actual" />
              <Tile label="Repaired" value={number(d.devices.repaired)} kind="actual" />
              <Tile label="Donated" value={number(d.devices.donated)} kind="actual" />
              <Tile label="Refurbished" value={number(d.devices.refurbished)} kind="actual" />
              <Tile label="Recycled" value={number(d.devices.recycled)} kind="actual" />
              <Tile label="Reused" value={number(d.devices.reused)} kind="actual" />
              <Tile label="Devices listed" value={number(d.devicesListed)} kind="actual" />
              <Tile label="Verified activities" value={number(d.verifiedActivities)} kind="actual" />
            </div>
          </section>

          <section aria-labelledby="materials-h" className="space-y-3">
            <h2 id="materials-h" className="text-xl font-bold text-ink dark:text-white">Materials and CO₂</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Tile label="Materials weighed at recycling centres" value={kg(d.materials.measuredKg)} kind="measured" help="Weighed on a scale." />
              <Tile label="Materials not weighed" value={kg(d.materials.estimatedKg)} kind="estimate" help="Worked out from the kind of device." />
              <Tile label="CO₂ avoided, about" value={kg(d.co2e.kgEstimated)} kind="estimate" help="Always an estimate." />
            </div>
            {d.factorsProvisional && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Estimates use placeholder figures that have not been sourced yet, so treat them as a rough guide only.</p>}
          </section>

          <section aria-labelledby="people-h" className="space-y-3">
            <h2 id="people-h" className="text-xl font-bold text-ink dark:text-white">The community</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Tile label="Verified technicians" value={number(d.activeTechnicians)} kind="actual" />
              <Tile label="Verified students" value={number(d.studentParticipants)} kind="actual" />
              <Tile label="Completed donations" value={number(d.completedDonations)} kind="actual" />
            </div>
          </section>
        </>
      )}

      {monthly.data && monthly.data.months.some((m) => m.devices > 0) && (
        <ChartCard
          title="Devices kept in use, month by month"
          summary="Each bar is a count of confirmed activity, split by kind."
          legend={typeSeries}
          columns={monthlyColumns}
          rows={monthlyTable(monthly.data.months)}
          height={280}
        >
          <MonthlyBars data={monthlyRows(monthly.data.months)} series={typeSeries.filter((s) => TYPE_ORDER.includes(s.key))} stacked />
        </ChartCard>
      )}

      {yearly.data && hasValues(yearlyItems(yearly.data.years)) && <BarList title="Year by year" summary="Devices kept in use each year, from confirmed activity only." items={yearlyItems(yearly.data.years)} />}
      {categories.data && hasValues(categoryItems(categories.data.categories)) && <BarList title="By kind of device" summary="Which devices the confirmed activity was about." items={categoryItems(categories.data.categories)} />}

      <RulesList />
      {d && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{d.method}</p>}
    </PageShell>
  );
}
