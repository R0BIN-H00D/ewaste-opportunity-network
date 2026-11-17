import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Plus, Star } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { adminEducationApi } from '../../services/adminApi';
import { EDUCATION_TOPIC_CHOICES, topicLabel } from '../../lib/education';
import Markdown from '../../lib/markdown';
import { formatDate } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function Form({ initial, onClose, onSaved }) {
  const save = useSave();
  const [form, setForm] = useState({
    title: initial?.title || '', topic: initial?.topic || '', summary: initial?.summary || '', body: initial?.body || '',
    featured: Boolean(initial?.featured), status: initial?.status || 'draft',
  });
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(false);
  const set = (name) => (e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setErrors((er) => ({ ...er, [name]: undefined })); save.reset(); };

  const submit = async () => {
    const found = {};
    if (form.title.trim().length < 3) found.title = 'Use at least 3 characters.';
    if (!form.topic) found.topic = 'Choose a topic.';
    if (form.body.trim().length < 20) found.body = 'Write at least a few sentences.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = { title: form.title.trim(), topic: form.topic, summary: form.summary.trim(), body: form.body.trim(), featured: form.featured, status: form.status };
    const res = await save.run(() => (initial ? adminEducationApi.update(initial._id, body) : adminEducationApi.create(body)), 'Saved');
    if (res.ok) onSaved();
  };

  const serverFields = save.status === 'error' ? save.error?.fieldErrors || {} : {};
  const shown = Object.values(errors).some(Boolean) ? errors : serverFields;
  const banner = save.status === 'error' && !Object.values(shown).some(Boolean) ? friendlyMessage(save.error) : '';
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit article' : 'New article'}
      footer={(
        <>
          <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <div className="space-y-3">
        <TextField label="Title" value={form.title} onChange={set('title')} error={shown.title} maxLength={160} />
        <TextField as="select" label="Topic" value={form.topic} onChange={set('topic')} error={shown.topic}>
          <option value="">Choose a topic…</option>
          {EDUCATION_TOPIC_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField as="textarea" rows={2} label="Summary (shown on the cards)" value={form.summary} onChange={set('summary')} error={shown.summary} maxLength={300} />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-ink dark:text-white">Article</span>
            <button type="button" className="text-sm font-semibold text-primary underline dark:text-primary-tint" onClick={() => setPreview((p) => !p)}>{preview ? 'Back to writing' : 'Preview'}</button>
          </div>
          {preview ? (
            <div className="glass-subtle max-h-80 overflow-auto p-4" aria-label="Preview"><Markdown source={form.body} /></div>
          ) : (
            <TextField as="textarea" rows={10} aria-label="Article text" value={form.body} onChange={set('body')} error={shown.body} maxLength={20000} hint="Headings with ## , bullets with - , **bold**, *italic*, [links](https://…)." />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField as="select" label="Status" value={form.status} onChange={set('status')}>
            <option value="draft">Draft (not on the site)</option>
            <option value="published">Published</option>
          </TextField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink dark:text-[#E8F1EB]">
            <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} /> Show first
          </label>
        </div>
        <Alert variant="error">{banner}</Alert>
      </div>
    </Modal>
  );
}

/** The learning-centre guides. Anything written here is a draft until it is published. */
export default function AdminEducation() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const topic = params.get('topic') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminEducationApi.list({ status, topic, page, limit: 10 }, signal), [status, topic, page]);
  const [form, setForm] = useState(null); // null | 'new' | article
  const [confirm, setConfirm] = useState(null); // { kind: 'delete' | 'unpublish', item }
  const [notice, setNotice] = useState('');
  const save = useSave();
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  const run = async (action) => {
    setNotice('');
    const res = await save.run(action, 'Done');
    setConfirm(null);
    if (res.ok) reload(); else setNotice(friendlyMessage(res.error));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Learning centre</h1>
        <button type="button" className="btn btn-primary" onClick={() => setForm('new')}><Plus size={18} aria-hidden /> New article</button>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Guides on e-waste, disposal, reuse, repair, recycling and data security. A draft is only visible here until you publish it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField as="select" label="Status" value={status} onChange={(e) => set({ status: e.target.value, topic })}>
          <option value="">All</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
        </TextField>
        <TextField as="select" label="Topic" value={topic} onChange={(e) => set({ status, topic: e.target.value })}>
          <option value="">All topics</option>
          {EDUCATION_TOPIC_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
      </div>
      <Alert variant="error">{notice}</Alert>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the articles" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} title={status || topic ? 'No article matches this' : 'There are no articles'}>
          {status || topic ? 'Try another filter.' : 'Write the first guide.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'article')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((a) => (
              <li key={a._id}>
                <GlassCard as="article" className="space-y-2 !p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink dark:text-white">{a.title}</h2>
                    <Badge tone={a.status === 'published' ? 'green' : 'amber'}>{a.status === 'published' ? 'Published' : 'Draft'}</Badge>
                    <Badge tone="neutral">{topicLabel(a.topic)}</Badge>
                    {a.featured && <Badge tone="blue"><Star size={12} aria-hidden /> First</Badge>}
                  </div>
                  {a.summary && <p className="text-sm text-ink dark:text-[#E8F1EB]">{a.summary}</p>}
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">/learn/{a.slug} · {a.readMinutes} min read · updated {formatDate(a.updatedAt)}{a.author ? ` · by ${a.author.name}` : ''}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`Edit ${a.title}`} onClick={() => setForm(a)}>Edit</button>
                    {a.status === 'draft'
                      ? <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`Publish ${a.title}`} onClick={() => run(() => adminEducationApi.update(a._id, { status: 'published' }))}>Publish</button>
                      : <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`Unpublish ${a.title}`} onClick={() => setConfirm({ kind: 'unpublish', item: a })}>Unpublish</button>}
                    <button type="button" className="btn btn-glass !px-4 !py-2 text-sm text-danger" aria-label={`Delete ${a.title}`} onClick={() => setConfirm({ kind: 'delete', item: a })}>Delete</button>
                  </div>
                </GlassCard>
              </li>
            ))}
          </ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, topic, ...(n > 1 ? { page: String(n) } : {}) })} />}

      {form && <Form initial={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      <ConfirmDialog
        open={confirm?.kind === 'unpublish'} title={`Unpublish “${confirm?.item.title}”?`} confirmLabel="Unpublish" busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminEducationApi.update(confirm.item._id, { status: 'draft' }))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">It disappears from the learning centre straight away and stays here as a draft.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'} title={`Delete “${confirm?.item.title}”?`} confirmLabel="Delete" busy={save.saving} danger
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminEducationApi.remove(confirm.item._id))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">It is removed from the site and from this list. The change is recorded in the audit log.</p>
      </ConfirmDialog>
    </div>
  );
}