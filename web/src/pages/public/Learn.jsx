import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Lightbulb } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import PageShell from '../../components/layout/PageShell';
import NotFound from '../NotFound';
import { EDUCATION_TOPICS } from '../../lib/content';

export function LearnIndex() {
  return (
    <PageShell wide title="Learning centre" intro="Short, practical guides on e-waste, safe disposal, reuse, repair, recycling and protecting your data.">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EDUCATION_TOPICS.map((t) => (
          <li key={t.slug}>
            <GlassCard className="flex h-full flex-col !p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><BookOpen size={22} aria-hidden /></span>
              <h2 className="mt-3 text-lg font-bold text-ink dark:text-white">{t.title}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{t.summary}</p>
              <Link to={`/learn/${t.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary dark:text-primary-tint">Read guide <ArrowRight size={16} aria-hidden /></Link>
            </GlassCard>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

export function LearnArticle() {
  const { slug } = useParams();
  const index = EDUCATION_TOPICS.findIndex((t) => t.slug === slug);
  if (index < 0) return <NotFound />;
  const topic = EDUCATION_TOPICS[index];
  const next = EDUCATION_TOPICS[(index + 1) % EDUCATION_TOPICS.length];
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/learn" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> All guides</Link>
      <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">{topic.title}</h1>
      <p className="mt-3 text-lg text-ink-muted dark:text-[#9FB2A7]">{topic.summary}</p>
      <ul className="mt-8 space-y-3">
        {topic.points.map((p) => <li key={p} className="glass-subtle px-5 py-4 text-sm leading-relaxed text-ink dark:text-[#E8F1EB]">{p}</li>)}
      </ul>
      <GlassCard className="mt-8 flex gap-3 !p-5">
        <Lightbulb size={22} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div><h2 className="font-bold text-ink dark:text-white">What you can do</h2><p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{topic.action}</p></div>
      </GlassCard>
      <p className="mt-8 text-sm"><Link to={`/learn/${next.slug}`} className="inline-flex items-center gap-1 font-semibold text-primary dark:text-primary-tint">Next: {next.title} <ArrowRight size={16} aria-hidden /></Link></p>
    </article>
  );
}
