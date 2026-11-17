import { useCallback, useEffect, useState } from 'react';
import { Lock, Medal } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ChartCard from '../../components/charts/ChartCard';
import { MonthlyBars } from '../../components/charts/Charts';
import GreenRing from '../../components/impact/GreenRing';
import RulesList from '../../components/impact/RulesList';
import { Tile } from '../../components/impact/Tiles';
import { useFetch } from '../../hooks/useFetch';
import { impactApi } from '../../services/impactApi';
import BarList from '../../components/impact/BarList';
import { kg, number } from '../../lib/analytics';
import { TYPE_LABEL, TYPE_ORDER, badgeProgress, categoryItems, hasValues, monthlyColumns, monthlyRows, monthlyTable, nextLevelText, signedPoints, typeSeries, yearlyItems } from '../../lib/impact';
import { toApiError } from '../../utils/errors';

const when = (v) => (v ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(v)) : '');

/** A person's Green Score, badges, history and their own impact. Points come only from activity the other side confirmed. */
export default function ImpactDashboard() {
  const [score, setScore] = useState({ data: null, loading: true, error: null });
  const [ledger, setLedger] = useState({ items: [], page: 1, pages: 1, loadingMore: false });
  const mine = useFetch((signal) => impactApi.mine(signal), []);
  const monthly = useFetch((signal) => impactApi.monthly({ scope: 'me', months: 12 }, signal), []);
  const yearly = useFetch((signal) => impactApi.yearly({ scope: 'me', years: 5 }, signal), []);
  const categories = useFetch((signal) => impactApi.byCategory({ scope: 'me' }, signal), []);

  const load = useCallback(async () => {
    setScore((s) => ({ ...s, loading: s.data === null, error: null }));
    try {
      const res = await impactApi.score({ page: 1, limit: 20 });
      setScore({ data: res, loading: false, error: null });
      setLedger({ items: res.ledger, page: res.meta.page, pages: res.meta.pages, loadingMore: false });
    } catch (err) {
      setScore({ data: null, loading: false, error: toApiError(err) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showMore = async () => {
    setLedger((l) => ({ ...l, loadingMore: true }));
    try {
      const res = await impactApi.score({ page: ledger.page + 1, limit: 20 });
      setLedger((l) => ({ items: [...l.items, ...res.ledger.filter((e) => !l.items.some((x) => x._id === e._id))], page: res.meta.page, pages: res.meta.pages, loadingMore: false }));
    } catch {
      setLedger((l) => ({ ...l, loadingMore: false }));
    }
  };

  const s = score.data;
  const m = mine.data;
  const earned = s ? s.badges.filter((b) => b.earned).length : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Green Score</h1>

      {score.loading && <Skeleton className="h-56" />}
      {score.error && <ErrorState error={score.error} onRetry={load} />}

      {s && (
        <>
          <GlassCard className="flex flex-col items-center gap-2 text-center">
            <GreenRing score={s.score} level={s.level} size={160} />
            <h2 className="text-2xl font-extrabold text-ink dark:text-white">{s.level.name}</h2>
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{nextLevelText(s.level, s.score)}</p>
            <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Points come only from activities the other person has confirmed as done.</p>
          </GlassCard>

          <GlassCard as="section" aria-labelledby="badges-h" className="space-y-3">
            <div>
              <h2 id="badges-h" className="text-lg font-bold text-ink dark:text-white">Badges</h2>
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{earned} of {s.badges.length} earned</p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {s.badges.map((b) => (
                <li key={b.key} className={`flex items-start gap-3 rounded-2xl border p-3 ${b.earned ? 'border-primary bg-primary/10' : 'border-black/10 dark:border-white/15'}`}>
                  {b.earned ? <Medal size={20} aria-hidden className="mt-0.5 shrink-0 text-primary dark:text-primary-tint" /> : <Lock size={20} aria-hidden className="mt-0.5 shrink-0 text-ink-muted dark:text-[#9FB2A7]" />}
                  <div>
                    <p className="font-semibold text-ink dark:text-white">{b.name}<span className="sr-only">{b.earned ? ', earned' : ', not yet earned'}</span></p>
                    <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{b.description}</p>
                    {!b.earned && <p className="mt-0.5 text-xs font-medium text-ink dark:text-[#E8F1EB]">{badgeProgress(b)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="text-xl font-bold text-ink dark:text-white">Your impact</h2>
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

      <GlassCard as="section" aria-labelledby="history-h" className="space-y-3">
        <h2 id="history-h" className="text-lg font-bold text-ink dark:text-white">How you earned it</h2>
        {ledger.items.length === 0 && !score.loading && <p className="text-ink-muted dark:text-[#9FB2A7]">Nothing earned yet.</p>}
        <ul className="space-y-2" aria-label="Score history">
          {ledger.items.map((e) => (
            <li key={e._id} className="flex gap-3 text-sm">
              <span className={`w-14 shrink-0 font-numeric text-base font-bold ${e.points < 0 ? 'text-danger' : 'text-primary dark:text-primary-tint'}`}>{e.points === 0 ? '0' : signedPoints(e.points)}</span>
              <span className="text-ink dark:text-[#E8F1EB]">{e.label}<span className="block text-xs text-ink-muted dark:text-[#9FB2A7]">{when(e.createdAt)}</span></span>
            </li>
          ))}
        </ul>
        {ledger.page < ledger.pages && <button type="button" className="btn btn-glass" onClick={showMore} disabled={ledger.loadingMore}>{ledger.loadingMore ? 'Loading...' : 'Show more'}</button>}
      </GlassCard>

      <RulesList />
    </div>
  );
}
