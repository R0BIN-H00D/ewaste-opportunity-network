import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Shapes } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { adminCategoryApi } from '../../services/adminApi';
import { friendlyMessage } from '../../utils/errors';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Add or edit. Only the fields that changed are sent, and the link name (slug) never changes. */
function CategoryForm({ initial, onClose, onSaved }) {
  const save = useSave();
  const [form, setForm] = useState({ name: initial?.name || '', icon: initial?.icon || '', group: initial?.group || '', hazardous: Boolean(initial?.hazardous) });
  const [errors, setErrors] = useState({});
  const change = (field) => (e) => { setForm({ ...form, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErrors({}); if (save.status === 'error') save.reset(); };

  const submit = async () => {
    const name = form.name.trim();
    if (name.length < 2) { setErrors({ name: 'Use at least 2 characters.' }); return; }
    const next = { name, icon: form.icon.trim(), group: form.group.trim(), hazardous: form.hazardous };
    let body;
    if (initial) {
      body = {};
      if (next.name !== initial.name) body.name = next.name;
      if (next.icon && next.icon !== initial.icon) body.icon = next.icon;
      if (next.group !== (initial.group || '')) body.group = next.group;
      if (next.hazardous !== initial.hazardous) body.hazardous = next.hazardous;
      if (!Object.keys(body).length) { onClose(); return; }
    } else {
      body = { name, hazardous: next.hazardous, ...(next.icon ? { icon: next.icon } : {}), ...(next.group ? { group: next.group } : {}) };
    }
    const res = await save.run(() => (initial ? adminCategoryApi.update(initial._id, body) : adminCategoryApi.create(body)), 'Saved');
    if (res.ok) onSaved();
  };

  // Field messages come straight from the failed save, so they never flash in the banner first.
  const serverFields = save.status === 'error' ? save.error?.fieldErrors || {} : {};
  const shown = Object.keys(errors).length ? errors : serverFields;
  const serverError = save.status === 'error' && !Object.keys(errors).length && !Object.keys(serverFields).length ? friendlyMessage(save.error) : '';
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : 'Add a category'}
      footer={(
        <>
          <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={save.saving}>{save.saving ? 'Saving…' : initial ? 'Save changes' : 'Add category'}</button>
        </>
      )}
    >
      <div className="space-y-3">
        <TextField label="Name" value={form.name} onChange={change('name')} error={shown.name} maxLength={60} />
        <TextField label="Icon" value={form.icon} onChange={change('icon')} error={shown.icon} hint="A Lucide icon name, such as laptop or battery. Leave empty for the default." />
        <TextField label="Group" value={form.group} onChange={change('group')} error={shown.group} maxLength={40} hint="Optional, for example Computers." />
        <label className="flex items-start gap-2 text-sm text-ink dark:text-[#E8F1EB]">
          <input type="checkbox" className="mt-1" checked={form.hazardous} onChange={change('hazardous')} />
          <span><span className="font-medium">Hazardous</span><br />Students cannot be given tasks on devices of this kind.</span>
        </label>
        {initial && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Its link name stays “{initial.slug}” so existing links keep working.</p>}
        <Alert variant="error">{serverError}</Alert>
      </div>
    </Modal>
  );
}

/** The device categories: add, rename, switch on and off, reorder and delete the ones nobody uses. */
export default function Categories() {
  const { data, error, loading, reload } = useFetch((signal) => adminCategoryApi.list(signal), []);
  const [form, setForm] = useState(null); // { initial? }
  const [confirm, setConfirm] = useState(null); // { kind, item }
  const [notice, setNotice] = useState({ variant: 'error', text: '' });
  const save = useSave();
  const items = data || [];

  const run = async (action) => {
    setNotice({ variant: 'error', text: '' });
    const res = await save.run(action, 'Done');
    if (res.ok) { setConfirm(null); reload(); } else setNotice({ variant: 'error', text: friendlyMessage(res.error) });
    return res.ok;
  };
  const move = (index, delta) => {
    const ids = items.map((c) => c._id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    return run(() => adminCategoryApi.reorder(ids));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Categories</h1>
        <button type="button" className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} aria-hidden /> Add category</button>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">People pick from active categories when they list a device. A category that is in use can be switched off but not deleted. Changes reach the public site within a few minutes.</p>
      <Alert variant={notice.variant}>{notice.text}</Alert>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load categories" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Shapes} title="There are no categories">Add the first one so people can list devices.</EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading || save.saving ? 'opacity-60' : ''}`}>
          {items.map((c, i) => (
            <li key={c._id}>
              <GlassCard as="article" className="flex flex-wrap items-center justify-between gap-3 !p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink dark:text-white">{c.name}</h2>
                    {!c.active && <Badge tone="neutral">Switched off</Badge>}
                    {c.hazardous && <Badge tone="amber">Hazardous</Badge>}
                    {c.group && <Badge tone="blue">{c.group}</Badge>}
                  </div>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
                    {plural(c.usage.listings, 'listing')} · {plural(c.usage.products, 'product')} · link name {c.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-glass !min-h-[40px] !px-3" onClick={() => move(i, -1)} disabled={i === 0 || save.saving} aria-label={`Move ${c.name} up`}><ArrowUp size={16} aria-hidden /></button>
                  <button type="button" className="btn btn-glass !min-h-[40px] !px-3" onClick={() => move(i, 1)} disabled={i === items.length - 1 || save.saving} aria-label={`Move ${c.name} down`}><ArrowDown size={16} aria-hidden /></button>
                  <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" onClick={() => setForm({ initial: c })} aria-label={`Edit ${c.name}`}>Edit</button>
                  {c.active
                    ? <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" onClick={() => setConfirm({ kind: 'off', item: c })} aria-label={`Switch off ${c.name}`}>Switch off</button>
                    : <button type="button" className="btn btn-glass !px-4 !py-2 text-sm" onClick={() => run(() => adminCategoryApi.update(c._id, { active: true }))} aria-label={`Switch on ${c.name}`}>Switch on</button>}
                  {c.canDelete && <button type="button" className="btn btn-glass !px-4 !py-2 text-sm text-danger" onClick={() => setConfirm({ kind: 'delete', item: c })} aria-label={`Delete ${c.name}`}>Delete</button>}
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      {form && <CategoryForm initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}

      <ConfirmDialog
        open={confirm?.kind === 'off'} title={`Switch off ${confirm?.item.name}?`} confirmLabel="Switch off" busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminCategoryApi.update(confirm.item._id, { active: false }))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">People can no longer choose it for new listings, and it leaves the public filters. Existing listings keep it. You can switch it back on at any time.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === 'delete'} title={`Delete ${confirm?.item.name}?`} confirmLabel="Delete category" danger busy={save.saving}
        onCancel={() => setConfirm(null)} onConfirm={() => run(() => adminCategoryApi.remove(confirm.item._id))}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Nothing uses this category, so it is removed for good. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
