import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Megaphone, Plus } from 'lucide-react';
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
import { adminAnnouncementApi } from '../../services/adminApi';
import { ROLE_LABEL } from '../../lib/admin';
import { formatDate } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';

const STATE = { current: ['Showing now', 'green'], scheduled: ['Scheduled', 'blue'], ended: ['Ended', 'neutral'] };
const ROLE_CHOICES = ['user', 'technician', 'refurbisher', 'recycler', 'admin'];
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
const audienceText = (list) => (list.includes('all') ? 'Everyone' : list.map((r) => ROLE_LABEL[r] || r).join(', '));

/** An ISO time as the value of a datetime-local box (the person's own time zone), and back. */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : '');

function Form({ initial, onClose, onSaved }) {
  const save = useSave();
  const start = {
    title: initial?.title || '',
    body: initial?.body || '',
    everyone: initial ? initial.audience.includes('all') : true,
    roles: initial && !initial.audience.includes('all') ? initial.audience : [],
    startsAt: initial ? toLocalInput(initial.startsAt) : '',
    endsAt: initial ? toLocalInput(initial.endsAt) : '',
  };
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState({});
  const set = (name) => (e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setErrors((er) => ({ ...er, [name]: undefined })); save.reset(); };
  const toggleRole = (role) => { setForm((f) => ({ ...f, roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role] })); setErrors((er) => ({ ...er, audience: undefined })); };

  const audience = form.everyone ? ['all'] : form.roles;
  const submit = async () => {
    const found = {};
    if (form.title.trim().length < 3) found.title = 'Use at least 3 characters.';
    if (form.body.trim().length < 5) found.body = 'Use at least 5 characters.';
    if (audience.length === 0) found.audience = 'Choose who should see it.';
    if (form.endsAt && form.startsAt && new Date(form.endsAt) <= new Date(form.startsAt)) found.endsAt = 'The end must be after the start.';
    if (!initial && form.endsAt && new Date(form.endsAt) <= new Date()) found.endsAt = 'The end must be in the future.';
    setErrors(found);
    if (Object.keys(found).length) return;

    let body;
    if (initial) {
      body = {};
      if (form.title.trim() !== initial.title) body.title = form.title.trim();
      if (form.body.trim() !== initial.body) body.body = form.body.trim();
      if (JSON.stringify([...audience].sort()) !== JSON.stringify([...initial.audience].sort())) body.audience = audience;
      if (form.startsAt !== start.startsAt) body.startsAt = toIso(form.startsAt) || new Date().toISOString();
      if (form.endsAt !== start.endsAt) body.endsAt = toIso(form.endsAt) || null;
      if (!Object.keys(body).length) { onClose(); return; }
    } else {
      body = { title: form.title.trim(), body: form.body.trim(), audience, ...(form.startsAt ? { startsAt: toIso(form.startsAt) } : {}), ...(form.endsAt ? { endsAt: toIso(form.endsAt) } : {}) };
    }
    const res = await save.run(() => (initial ? adminAnnouncementApi.update(initial._id, body) : adminAnnouncementApi.create(body)), 'Saved');
    if (res.ok) onSaved();
  };

  // Field problems come straight from the failed save, so they never flash in the banner first.
  const serverFields = save.status === 'error' ? save.error?.fieldErrors || {} : {};
  const shown = Object.values(errors).some(Boolean) ? errors : serverFields;
  const banner = save.status === 'error' && !Object.values(shown).some(Boolean) ? friendlyMessage(save.error) : '';
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Edit announcement' : 'New announcement'}
      footer={(
        <>
          <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : initial ? 'Save changes' : 'Publish'}</button>
        </>
      )}
    >
      <div className="space-y-3">
        <TextField label="Title" value={form.title} onChange={set('title')} error={shown.title} maxLength={140} />
        <TextField as="textarea" rows={4} label="Message" value={form.body} onChange={set('body')} error={shown.body} maxLength={2000} />
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-ink dark:text-white">Who sees it</legend>
          <label className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
            <input type="checkbox" checked={form.everyone} onChange={(e) => { setForm((f) => ({ ...f, everyone: e.target.checked })); setErrors((er) => ({ ...er, audience: undefined })); }} /> Everyone, including visitors
          </label>
          {!form.everyone && (
            <div className="grid gap-1 sm:grid-cols-2">
              {ROLE_CHOICES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
                  <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} /> {r === 'admin' ? 'Administrators' : ROLE_LABEL[r] || r}
                </label>
              ))}
            </div>
          )}
          {(shown.audience) && <p role="alert" className="text-xs font-medium text-danger dark:text-red-300">{shown.audience}</p>}
        </fieldset>
        <TextField type="datetime-local" label="Starts (optional)" value={form.startsAt} onChange={set('startsAt')} error={shown.startsAt} hint="Leave empty to show it straight away." />
        <TextField type="datetime-local" label="Ends (optional)" value={form.endsAt} onChange={set('endsAt')} error={shown.endsAt} hint="Leave empty to keep showing it until you end it." />
        <Alert variant="error">{banner}</Alert>
      </div>
    </Modal>
  );
}

/** Messages that show as a banner. Everyone sees the ones for everyone; a role sees the ones meant for it. */
export default function Announcements() {
  const [params, setParams] = useSearchParams();
  const state = params.get('state') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminAnnouncementApi.list({ state, page, limit: 10 }, signal), [state, page]);
  const [form, setForm] = useState(null); // null | 'new' | announcement
  const [confirm, setConfirm] = useState(null); // { kind: 'end' | 'delete', item }
  const [notice, setNotice] = useState({ variant: 'error', text: '' });
  const save = useSave();
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  const run = async (action) => {
    setNotice({ variant: 'error', text: '' });
    const res = await save.run(action, 'Done');
    if (res.ok) { setConfirm(null); reload(); } else { setConfirm(null); setNotice({ variant: 'error', text: friendlyMessage(res.error) }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Announcements</h1>
        <button type="button" className="btn btn-primary" onClick={() => setForm('new')}><Plus size={18} aria-hidden /> New announcement</button>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Short messages that show as a banner on the site. Use them for planned maintenance or something everyone should know.</p>
      <TextField as="select" label="Show" value={state} onChange={(e) => set({ state: e.target.value })} className="w-48">
        <option value="">All</option>
        <option value="current">Showing now</option>
        <option value="scheduled">Scheduled</option>
        <option value="ended">Ended</option>
      </TextField>
      <Alert variant={notice.variant}>{notice.text}</Alert>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load announcements" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} title={state ? 'No announcement matches this' : 'There are no announcements'}>
          {state ? 'Try another filter.' : 'Write one when everyone needs to know something.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'announcement')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((a) => {
              const [label, tone] = STATE[a.state] || [a.state, 'neutral'];
              return (
                <li key={a._id}>
                  <GlassCard as="article" className="space-y-2 !p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-ink dark:text-white">{a.title}</h2>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{a.body}</p>
                    <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
                      For {audienceText(a.audience)} · from {formatDate(a.startsAt)} · {a.endsAt ? `until ${formatDate(a.endsAt)}` : 'no end date'}{a.createdBy ? ` · by ${a.createdBy.name}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`Edit ${a.title}`} onClick={() => setForm(a)}>Edit</button>
                      {a.state === 'current' && <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" aria-label={`End ${a.title} now`} onClick={() => setConfirm({ kind: 'end', item: a })}>End now</button>}
                      <button type="button" className="btn btn-glass !px-4 !py-2 text-sm text-danger" aria-label={`Delete ${a.title}`} onClick={() => setConfirm({ kind: 'delete', item: a })}>Delete</button>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ state, ...(n > 1 ? { page: String(n) } : {}) })} />}

      {form && <Form initial={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
      <ConfirmDialog
        open={confirm?.kind === 'end'} title={`End “${confirm?.item.title}” now?`} confirmLabel="End now" busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminAnnouncementApi.update(confirm.item._id, { endsAt: new Date().toISOString() }))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">It stops showing on the site straight away. It stays in this list as ended.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'} title={`Delete “${confirm?.item.title}”?`} confirmLabel="Delete announcement" danger busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminAnnouncementApi.remove(confirm.item._id))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">It is removed for good. The audit log keeps a note of what it said.</p>
      </ConfirmDialog>
    </div>
  );
}
