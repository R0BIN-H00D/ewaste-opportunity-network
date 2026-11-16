import { Link } from 'react-router-dom';
import { Recycle, Sprout, Wrench } from 'lucide-react';
import PageShell from '../../components/layout/PageShell';
import EmptyState from '../../components/ui/EmptyState';
import GlassCard from '../../components/glass/GlassCard';
import { useFetch } from '../../hooks/useFetch';
import { deviceApi } from '../../services/deviceApi';

export function ServicesPage() {
  return (
    <PageShell wide title="Find services" intro="Verified technicians and recycling centres near you. Every provider is checked by an administrator before appearing here.">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="techs"><h2 id="techs" className="mb-3 flex items-center gap-2 text-xl font-bold text-ink dark:text-white"><Wrench size={20} aria-hidden /> Technicians</h2>
          <EmptyState icon={Wrench} title="Find a verified technician" action={<Link to="/technicians" className="btn btn-primary">Browse technicians</Link>}>Compare ratings, experience and service areas. Not a customer? <Link to="/register" className="font-semibold underline">Join as a technician</Link>.</EmptyState>
        </section>
        <section aria-labelledby="centres"><h2 id="centres" className="mb-3 flex items-center gap-2 text-xl font-bold text-ink dark:text-white"><Recycle size={20} aria-hidden /> Recycling centres</h2>
          <EmptyState icon={Recycle} title="Find an authorised recycling centre" action={<Link to="/recycling-centers" className="btn btn-primary">Browse recycling centres</Link>}>See the materials each centre accepts, its authorisation and opening hours. Run a centre? <Link to="/register" className="font-semibold underline">Join as a recycling centre</Link>.</EmptyState>
        </section>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Meanwhile, <Link to="/list-device" className="font-semibold text-primary underline dark:text-primary-tint">list your device</Link> so providers can find you as they join.</p>
    </PageShell>
  );
}

/** Real numbers only. More figures appear as completed activities are recorded (FR-IMP-006). */
export function ImpactPage() {
  const { data, loading, error } = useFetch((signal) => deviceApi.list({ limit: 1 }, signal), []);
  return (
    <PageShell title="Environmental impact" intro="Our numbers come from recorded activity on the platform. Nothing here is estimated unless it is labelled as an estimate.">
      <GlassCard className="text-center">
        <Sprout size={32} aria-hidden className="mx-auto text-secondary-strong dark:text-primary-tint" />
        <p className="mt-2 font-numeric text-5xl font-extrabold text-primary dark:text-primary-tint" aria-live="polite">{loading ? '…' : error ? '–' : data.meta.total}</p>
        <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{error ? 'The live count is unavailable right now.' : 'devices currently offered for repair, reuse, donation or recycling (measured)'}</p>
      </GlassCard>
      <GlassCard>
        <h2 className="text-lg font-bold text-ink dark:text-white">What will appear here</h2>
        <p className="mt-2 text-sm text-ink dark:text-[#E8F1EB]">When repairs, donations, refurbishments and recycling jobs are completed and verified, this page will show devices repaired, reused and recycled, materials recovered, and Green Score leaders. Each figure will say whether it is measured or estimated.</p>
      </GlassCard>
    </PageShell>
  );
}
