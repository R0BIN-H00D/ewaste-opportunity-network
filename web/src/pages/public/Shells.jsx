import { Link } from 'react-router-dom';
import { Recycle, Wrench } from 'lucide-react';
import PageShell from '../../components/layout/PageShell';
import EmptyState from '../../components/ui/EmptyState';

export function ServicesPage() {
  return (
    <PageShell wide title="Find services" intro="Verified technicians and recycling centres near you. Every provider is checked by an administrator before appearing here.">
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="techs"><h2 id="techs" className="mb-3 flex items-center gap-2 text-xl font-bold text-ink dark:text-white"><Wrench size={20} aria-hidden /> Technicians</h2>
          <EmptyState icon={Wrench} art="tools" title="Find a verified technician" action={<Link to="/technicians" className="btn btn-primary">Browse technicians</Link>}>Compare ratings, experience and service areas. Not a customer? <Link to="/register" className="font-semibold underline">Join as a technician</Link>.</EmptyState>
        </section>
        <section aria-labelledby="centres"><h2 id="centres" className="mb-3 flex items-center gap-2 text-xl font-bold text-ink dark:text-white"><Recycle size={20} aria-hidden /> Recycling centres</h2>
          <EmptyState icon={Recycle} art="recycle" title="Find an authorised recycling centre" action={<Link to="/recycling-centers" className="btn btn-primary">Browse recycling centres</Link>}>See the materials each centre accepts, its authorisation and opening hours. Run a centre? <Link to="/register" className="font-semibold underline">Join as a recycling centre</Link>.</EmptyState>
        </section>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Meanwhile, <Link to="/list-device" className="font-semibold text-primary underline dark:text-primary-tint">list your device</Link> so providers can find you as they join.</p>
    </PageShell>
  );
}
