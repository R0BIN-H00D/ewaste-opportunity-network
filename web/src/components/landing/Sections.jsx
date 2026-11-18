import { Link } from 'react-router-dom';
import {
  ArrowRight, Battery, Box, Cable, Cpu, HardDrive, Handshake, Heart, Keyboard, Laptop, Leaf, Monitor, MonitorSmartphone,
  Mouse, PackagePlus, Plug, Printer, Recycle, ShieldCheck, Smartphone, Tablet, Truck, Tv, Wrench,
} from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Accordion from '../ui/Accordion';
import DeviceCard, { DeviceCardSkeleton } from '../devices/DeviceCard';
import { useCategories } from '../../hooks/useCategories';
import { useFetch } from '../../hooks/useFetch';
import { deviceApi } from '../../services/deviceApi';
import { AUDIENCES, FAQ, HOW_STEPS } from '../../lib/content';

const ICONS = {
  laptop: Laptop, 'monitor-smartphone': MonitorSmartphone, smartphone: Smartphone, tablet: Tablet, monitor: Monitor, tv: Tv, keyboard: Keyboard,
  mouse: Mouse, printer: Printer, plug: Plug, battery: Battery, cable: Cable, cpu: Cpu, 'hard-drive': HardDrive, box: Box,
};
const STEP_ICONS = [PackagePlus, Handshake, Truck, Leaf];
const AUDIENCE_ICONS = { repair: Wrench, donate: Heart, refurbished: Laptop, recycle: Recycle };

export function Section({ id, title, intro, children, className = '' }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`mx-auto max-w-7xl px-4 py-12 ${className}`}>
      <h2 id={`${id}-title`} className="text-2xl font-extrabold text-ink dark:text-white sm:text-3xl">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-ink-muted dark:text-[#9FB2A7]">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Only real numbers: the live count comes from the API; nothing here is hard-coded (FR-IMP-006). */
export function TrustStrip({ total, categories }) {
  const items = [
    [total === null ? '…' : String(total), total === 1 ? 'device available now' : 'devices available now'],
    [String(categories || '…'), 'device categories'],
    ['5', 'ways to give a device new life'],
    ['Free', 'to list and browse'],
  ];
  return (
    <section aria-label="Platform at a glance" className="mx-auto max-w-7xl px-4">
      <dl className="glass grid grid-cols-2 gap-4 p-5 text-center sm:grid-cols-4">
        {items.map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
            <dd className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HowItWorks() {
  return (
    <Section id="how" title="How it works" intro="From a drawer full of old gadgets to a second life in four steps.">
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_STEPS.map((s, i) => {
          const Icon = STEP_ICONS[i];
          return (
            <li key={s.title}>
              <GlassCard className="h-full !p-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><Icon size={24} aria-hidden /></span>
                <h3 className="mt-3 text-base font-bold text-ink dark:text-white"><span className="text-ink-muted">{i + 1}.</span> {s.title}</h3>
                <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{s.text}</p>
              </GlassCard>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export function Categories() {
  const categories = useCategories();
  return (
    <Section id="categories" title="Device categories" intro="Pick a category to see what people are giving away, repairing or recycling.">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(categories.length ? categories : Array.from({ length: 10 }, (_, i) => ({ slug: i }))).map((c) => {
          const Icon = ICONS[c.icon] || Box;
          return (
            <li key={c.slug}>
              {c.name ? (
                <Link to={`/browse?category=${c.slug}`} className="glass-subtle flex min-h-[72px] items-center gap-3 px-4 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-e1 dark:text-white">
                  <Icon size={22} aria-hidden className="shrink-0 text-secondary-strong dark:text-primary-tint" /> {c.name}
                </Link>
              ) : (
                <div className="skeleton h-[72px] !rounded-2xl" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Audiences() {
  return (
    <Section id="services" title="One platform, many ways to help" intro="Whatever the state of your device, there is a person or partner who can use it.">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCES.map((a) => {
          const Icon = AUDIENCE_ICONS[a.id];
          return (
            <li key={a.id}>
              <GlassCard className="flex h-full flex-col !p-5">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary/15 text-secondary-strong dark:text-primary-tint"><Icon size={24} aria-hidden /></span>
                <h3 className="mt-3 text-lg font-bold text-ink dark:text-white">{a.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{a.text}</p>
                <Link to={a.to} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary dark:text-primary-tint">{a.cta} <ArrowRight size={16} aria-hidden /></Link>
              </GlassCard>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function LatestDevices({ data, loading, error }) {
  const items = (data?.items || []).slice(0, 4);
  return (
    <Section id="latest" title="Recently listed" intro="Fresh listings from people near you and across the network.">
      {error ? (
        <GlassCard role="alert" className="text-center text-sm text-ink-muted dark:text-[#9FB2A7]">Listings could not be loaded right now. <Link to="/browse" className="font-semibold text-primary underline dark:text-primary-tint">Try the browse page</Link>.</GlassCard>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <DeviceCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <GlassCard className="text-center">
          <p className="text-ink dark:text-white">No devices are listed yet. Be the first!</p>
          <Link to="/list-device" className="btn btn-primary mt-4">List a device</Link>
        </GlassCard>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map((l) => <DeviceCard key={l._id} listing={l} />)}</div>
          <p className="mt-6 text-center"><Link to="/browse" className="btn btn-glass">Browse all devices <ArrowRight size={16} aria-hidden /></Link></p>
        </>
      )}
    </Section>
  );
}

export function ProviderCta() {
  return (
    <Section id="providers" title="Are you a technician, refurbisher or recycler?" intro="Verified providers receive requests from people nearby and build a trusted profile.">
      <GlassCard className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-3 text-sm text-ink dark:text-[#E8F1EB]">
          <ShieldCheck size={22} aria-hidden className="mt-0.5 shrink-0 text-secondary-strong dark:text-primary-tint" />
          Create a provider account, submit your documents, and start once an administrator approves you.
        </p>
        <Link to="/register" className="btn btn-primary">Join as a provider</Link>
      </GlassCard>
    </Section>
  );
}

export function FaqSection() {
  return (
    <Section id="faq" title="Frequently asked questions">
      <div className="max-w-3xl"><Accordion items={FAQ} /></div>
    </Section>
  );
}

export function useLandingData() {
  return useFetch((signal) => deviceApi.list({ limit: 4, sort: 'newest' }, signal), []);
}
