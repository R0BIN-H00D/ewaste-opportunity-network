import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Clock } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import PageShell from '../../components/layout/PageShell';
import Skeleton from '../../components/ui/Skeleton';
import Markdown from '../../lib/markdown';
import NotFound from '../NotFound';
import { EDUCATION_TOPICS } from '../../lib/content';
import { educationApi } from '../../services/educationApi';

// The guides that shipped with the site. They are shown at once and while the server is out of reach; once the server answers,
// what an administrator has written there takes their place.
const STARTER = EDUCATION_TOPICS.map((t) => ({
  slug: t.slug, title: t.title, summary: t.summary,
  body: `${t.points.map((p) => `- ${p}`).join('\n')}\n\n## What you can do\n\n${t.action}`,
}));

export function LearnIndex() {
  const [articles, setArticles] = useState(STARTER);
  useEffect(() => {
    const controller = new AbortController();
    educationApi.list({ limit: 50 }, controller.signal).then(({ items }) => { if (!controller.signal.aborted && items.length) setArticles(items); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <PageShell wide title="Learning centre" intro="Short, practical guides on e-waste, safe disposal, reuse, repair, recycling and protecting your data.">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((t) => (
          <li key={t.slug}>
            <GlassCard className="flex h-full flex-col !p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><BookOpen size={22} aria-hidden /></span>
              <h2 className="mt-3 text-lg font-bold text-ink dark:text-white">{t.title}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{t.summary}</p>
              {t.readMinutes && <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><Clock size={12} aria-hidden /> {t.readMinutes} min read</p>}
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
  const starterIndex = STARTER.findIndex((t) => t.slug === slug);
  const starter = starterIndex >= 0 ? { ...STARTER[starterIndex], next: STARTER[(starterIndex + 1) % STARTER.length] } : null;
  const [article, setArticle] = useState(starter);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false); // the server could not be reached and there is no built-in copy to show
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setMissing(false);
    setFailed(false);
    setArticle(starter);
    educationApi.get(slug, controller.signal)
      .then((a) => { if (!controller.signal.aborted) setArticle(a); })
      .catch((err) => {
        // "Not found" is the server's answer, so a guide that was unpublished or deleted is gone. Any other failure keeps what is shown.
        if (controller.signal.aborted) return;
        if (err?.response?.status === 404) setMissing(true);
        else setFailed(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `starter` is derived from `slug`
  }, [slug, attempt]);

  if (missing) return <NotFound />;
  if (failed && !article) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-ink dark:text-white">We could not load this guide. Check your connection and try again.</p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </div>
    );
  }
  if (!article) return <div className="mx-auto max-w-3xl px-4 py-12" aria-busy><Skeleton className="h-10 w-2/3" /><Skeleton className="mt-4 h-40 w-full" /></div>;
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Link to="/learn" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> All guides</Link>
      <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">{article.title}</h1>
      {article.summary && <p className="mt-3 text-lg text-ink-muted dark:text-[#9FB2A7]">{article.summary}</p>}
      {article.readMinutes && <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><Clock size={12} aria-hidden /> {article.readMinutes} min read</p>}
      <Markdown source={article.body} className="mt-8" />
      {article.next && <p className="mt-8 text-sm"><Link to={`/learn/${article.next.slug}`} className="inline-flex items-center gap-1 font-semibold text-primary dark:text-primary-tint">Next: {article.next.title} <ArrowRight size={16} aria-hidden /></Link></p>}
    </article>
  );
}