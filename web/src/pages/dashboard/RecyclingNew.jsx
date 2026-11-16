import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import PhotoPicker from '../../components/devices/PhotoPicker';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { centerApi, recyclingApi } from '../../services/recyclingApi';
import { deviceApi } from '../../services/deviceApi';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const FIELDS = ['centerId', 'categories', 'deviceCount', 'pickupAddressArea', 'pickupAddress', 'preferredDate', 'notes', 'photos', 'listingId'];
const asKey = (name) => (name === 'centerId' ? 'center' : name);

function validate(v) {
  const e = {};
  if (!v.center) e.center = 'Choose a recycling centre.';
  if (v.categories.length === 0) e.categories = 'Choose at least one category.';
  const count = Number(v.deviceCount);
  if (!Number.isInteger(count) || count < 1 || count > 500) e.deviceCount = 'Enter a whole number from 1 to 500.';
  if (v.area.trim().length < 2) e.area = 'Enter the area or locality.';
  if (v.address.trim().length < 5) e.address = 'Enter the full pickup address.';
  if (v.preferredDate) {
    const when = new Date(`${v.preferredDate}T23:59:59`);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) e.preferredDate = 'Choose a date in the future.';
  }
  return e;
}

function Form({ centers, listing, initialCenter }) {
  const navigate = useNavigate();
  const save = useSave();
  const [values, setValues] = useState({ center: initialCenter || '', categories: [], deviceCount: '1', area: '', address: '', preferredDate: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const center = centers.find((c) => c._id === values.center);
  const accepted = center?.acceptedCategories || [];

  const clear = (name) => setErrors((er) => ({ ...er, [name]: undefined }));
  const set = (name) => (e) => { setValues((v) => ({ ...v, [name]: e.target.value })); clear(name); };
  const pickCenter = (e) => {
    const next = centers.find((c) => c._id === e.target.value);
    const ok = new Set((next?.acceptedCategories || []).map((c) => c._id));
    const fromListing = listing?.category?._id && ok.has(listing.category._id) ? [listing.category._id] : [];
    setValues((v) => ({ ...v, center: e.target.value, categories: v.categories.filter((id) => ok.has(id)).length ? v.categories.filter((id) => ok.has(id)) : fromListing }));
    clear('center');
  };
  const toggle = (id) => {
    setValues((v) => ({ ...v, categories: v.categories.includes(id) ? v.categories.filter((c) => c !== id) : [...v.categories, id] }));
    clear('categories');
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return null;
    const form = new FormData();
    form.append('centerId', values.center);
    form.append('categories', JSON.stringify(values.categories));
    form.append('deviceCount', String(Number(values.deviceCount)));
    form.append('pickupAddressArea', values.area.trim());
    form.append('pickupAddress', values.address.trim());
    if (values.preferredDate) form.append('preferredDate', new Date(`${values.preferredDate}T12:00:00`).toISOString());
    if (values.notes.trim()) form.append('notes', values.notes.trim());
    if (listing) form.append('listingId', listing._id);
    files.forEach((f) => form.append('photos', f));
    const res = await save.run(() => recyclingApi.create(form), 'Request sent');
    if (res.ok) navigate(`/dashboard/recycling/${res.result._id}`, { state: { flash: 'Your recycling request was sent. The centre will respond soon.' } });
    else applyFieldErrors(res.error, (name, { message }) => setErrors((er) => ({ ...er, [asKey(name)]: message })), FIELDS);
    return res;
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label="Request recycling">
      {listing && <Alert variant="info">Sending your listed device “{listing.title}”. It is held for this request until it is completed or cancelled.</Alert>}
      <GlassCard className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" as="select" label="Recycling centre" value={values.center} onChange={pickCenter} error={errors.center}>
          <option value="">Choose a centre</option>
          {centers.map((c) => <option key={c._id} value={c._id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>)}
        </TextField>

        <fieldset className="sm:col-span-2" aria-describedby={errors.categories ? 'cat-error' : undefined}>
          <legend className="mb-2 text-sm font-semibold text-ink dark:text-white">What are you sending?</legend>
          {!center ? (
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Choose a centre to see the categories it accepts.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {accepted.map((c) => (
                <li key={c._id}>
                  <label className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-sm text-ink dark:text-white">
                    <input type="checkbox" checked={values.categories.includes(c._id)} onChange={() => toggle(c._id)} className="h-5 w-5 accent-[#1E8449]" />
                    {c.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {errors.categories && <p id="cat-error" role="alert" className="mt-1 text-xs font-medium text-danger dark:text-red-300">{errors.categories}</p>}
        </fieldset>

        <TextField label="Number of devices" type="number" inputMode="numeric" min="1" max="500" value={values.deviceCount} onChange={set('deviceCount')} error={errors.deviceCount} />
        <TextField label="Preferred pickup date (optional)" type="date" value={values.preferredDate} onChange={set('preferredDate')} error={errors.preferredDate} hint="The centre confirms the actual time with you." />
        <TextField className="sm:col-span-2" label="Area or locality" value={values.area} onChange={set('area')} error={errors.area} maxLength={100} placeholder="Indiranagar" hint="Shown to the centre when it decides on your request." />
        <TextField className="sm:col-span-2" as="textarea" rows={2} label="Full pickup address" value={values.address} onChange={set('address')} error={errors.address} maxLength={250} hint="Private. The centre sees it only after accepting your request, and not after the devices are collected." />
        <TextField className="sm:col-span-2" as="textarea" rows={2} label="Notes (optional)" value={values.notes} onChange={set('notes')} error={errors.notes} maxLength={500} placeholder="Floor, gate instructions, anything the centre should know" />
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="text-lg font-bold text-ink dark:text-white">Photos (optional)</h2>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">A photo of the devices helps the centre plan the pickup.</p>
        <PhotoPicker files={files} onFiles={(f) => { setFiles(f); clear('photos'); }} existing={[]} removed={[]} onRemoved={() => {}} error={errors.photos} />
      </GlassCard>

      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Sending…' : 'Send request'}</button>
        <Link to="/dashboard/recycling" className="btn btn-glass">Cancel</Link>
      </div>
    </form>
  );
}

/** Send devices to a recycling centre: /dashboard/recycling/new?center=ID or ?listing=ID (a listed device set to recycling). */
export default function RecyclingNew() {
  const [params] = useSearchParams();
  const listingId = params.get('listing');
  const centers = useFetch((signal) => centerApi.list({ limit: 100 }, signal), []);
  const listing = useFetch((signal) => deviceApi.get(listingId, signal), [listingId], { enabled: Boolean(listingId) });

  let body;
  if (centers.error) body = <ErrorState error={centers.error} onRetry={centers.reload} title="Could not load the recycling centres" />;
  else if (listingId && listing.error) body = <ErrorState error={listing.error} onRetry={listing.reload} title="Could not load that device" />;
  else if ((centers.loading && !centers.data) || (listingId && listing.loading && !listing.data)) body = <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  else if (!centers.data.items.length) body = <Alert variant="info">There are no authorised recycling centres yet. Please check again soon.</Alert>;
  else body = <Form centers={centers.data.items} listing={listingId ? listing.data : null} initialCenter={centers.data.items.some((c) => c._id === params.get('center')) ? params.get('center') : ''} />;

  return (
    <div className="space-y-4">
      <Link to="/dashboard/recycling" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Recycling</Link>
      <h1 className="text-2xl font-bold text-ink dark:text-white">Request recycling</h1>
      {body}
    </div>
  );
}
