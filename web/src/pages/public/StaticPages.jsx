import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageShell, { TextCard } from '../../components/layout/PageShell';
import Alert from '../../components/ui/Alert';
import { HowItWorks as HowSteps } from '../../components/landing/Sections';
import { HOW_STEPS, LEGAL_NOTE, PRIVACY, TERMS } from '../../lib/content';

export function HowItWorksPage() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-12">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">How it works</h1>
        <p className="mt-3 text-lg text-ink-muted dark:text-[#9FB2A7]">{HOW_STEPS.length} simple steps, whether you are giving a device away, repairing it or recycling it.</p>
      </div>
      <HowSteps />
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8">
        <TextCard title="Who does what">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Individuals</strong> list devices and choose a service.</li>
            <li><strong>Technicians</strong> offer repairs and send quotations.</li>
            <li><strong>Refurbishers</strong> restore devices and sell them.</li>
            <li><strong>Recycling centres</strong> process what cannot be saved, with records.</li>
          </ul>
        </TextCard>
        <p><Link to="/learn" className="inline-flex items-center gap-1 font-semibold text-primary dark:text-primary-tint">Read the learning centre <ArrowRight size={16} aria-hidden /></Link></p>
      </div>
    </>
  );
}

export function AboutPage() {
  return (
    <PageShell title="About us" intro="We help people keep electronics in use for longer and make sure the rest is recycled responsibly.">
      <TextCard title="Why we exist">Millions of working or repairable devices are thrown away every year while many schools, students and small organisations cannot afford the equipment they need. We connect the two sides, and we make repair, reuse and recycling easy to find.</TextCard>
      <TextCard title="How we work">Every provider is verified by an administrator. Public pages never reveal exact addresses. Impact numbers come only from recorded, completed activities, and estimates are always labelled as estimates.</TextCard>
      <TextCard title="Built to be accessible"><p>The platform runs as a website and an Android app on the same data, and it is designed to work on modest devices and connections.</p></TextCard>
      <p><Link to="/contact" className="inline-flex items-center gap-1 font-semibold text-primary dark:text-primary-tint">Get in touch <ArrowRight size={16} aria-hidden /></Link></p>
    </PageShell>
  );
}

function Legal({ title, sections }) {
  return (
    <PageShell title={title}>
      <Alert variant="info">{LEGAL_NOTE}</Alert>
      {sections.map(([heading, body]) => <TextCard key={heading} title={heading}>{body}</TextCard>)}
    </PageShell>
  );
}
export const PrivacyPage = () => <Legal title="Privacy policy" sections={PRIVACY} />;
export const TermsPage = () => <Legal title="Terms and conditions" sections={TERMS} />;
