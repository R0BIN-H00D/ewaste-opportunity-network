import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, LocateFixed } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import TextField from '../ui/TextField';
import Alert from '../ui/Alert';
import PhotoPicker from './PhotoPicker';
import AiSuggestion from './AiSuggestion';
import { toSavedSuggestion } from '../../lib/ai';
import { useCategories } from '../../hooks/useCategories';
import { deviceApi } from '../../services/deviceApi';
import { applyFieldErrors, toApiError } from '../../utils/errors';
import { CONDITIONS, MAX_PHOTOS, PICKUPS, SERVICES, formatPrice, labelOf } from '../../lib/devices';
import { CHECKLIST, EMPTY_VALUES, STEP_FIELDS, deviceSchema, listingToValues, toDevicePayload } from '../../lib/deviceSchema';

const FIELD_STEP = Object.fromEntries(Object.entries(STEP_FIELDS).flatMap(([step, fields]) => fields.map((f) => [f, step])));

/**
 * Multi-step form used to create a listing (mode="create") or change one (mode="edit", pass `listing`).
 * Steps: details -> condition & photos -> service & location -> data-protection checklist -> review.
 * The checklist is skipped when editing a listing that is already live.
 */
export default function DeviceForm({ mode = 'create', listing }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const editing = mode === 'edit';
  const liveEdit = editing && listing.status === 'listed';

  const steps = useMemo(
    () => [
      { id: 'details', title: 'Details' },
      { id: 'photos', title: 'Condition & photos' },
      { id: 'service', title: 'Service & location' },
      ...(liveEdit ? [] : [{ id: 'safety', title: 'Data protection' }]),
      { id: 'review', title: 'Review' },
    ],
    [liveEdit],
  );

  const form = useForm({
    resolver: zodResolver(deviceSchema),
    mode: 'onTouched',
    defaultValues: editing ? listingToValues(listing) : EMPTY_VALUES,
  });
  const { register, trigger, getValues, setValue, setError, formState: { errors } } = form;

  // The category <select> has no options until the list arrives, so re-apply the saved value once it does.
  const savedCategory = editing ? listing.category?.slug : '';
  useEffect(() => {
    if (savedCategory && categories.length) setValue('category', savedCategory);
  }, [savedCategory, categories.length, setValue]);

  const [stepIndex, setStepIndex] = useState(0);
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [checks, setChecks] = useState(CHECKLIST.map(() => false));
  const [coords, setCoords] = useState(null);
  const [geoMessage, setGeoMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(null); // a suggestion the person chose to use (FR-AI-002)

  /** Fills in what the person accepted. Nothing they have already typed is overwritten. */
  const useSuggestion = (s) => {
    setAccepted(s);
    if (s.category?.slug) setValue('category', s.category.slug, { shouldValidate: true });
    if (s.brand && !getValues('brand')?.trim()) setValue('brand', s.brand);
    if (s.visibleDamage?.length && !getValues('description')?.trim()) setValue('description', `Looks like: ${s.visibleDamage.join(', ')}.`);
  };

  const existing = editing ? listing.device?.photos || [] : [];
  const photoCount = existing.filter((p) => !removed.includes(p.publicId)).length + files.length;
  const step = steps[stepIndex];
  const allChecked = checks.every(Boolean);
  const hadLocation = Boolean(editing && listing.location);

  const goNext = async () => {
    const fields = STEP_FIELDS[step.id];
    if (fields && !(await trigger(fields, { shouldFocus: true }))) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const locate = () => {
    if (!navigator.geolocation) return setGeoMessage('Your browser cannot share its location. You can still list with the area and city.');
    setGeoMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) });
        setGeoMessage('Location saved. Others only ever see an approximate area.');
      },
      () => setGeoMessage('Could not get your location. You can still list with the area and city.'),
      { timeout: 10000 },
    );
  };

  /** status: 'draft' | 'listed' | undefined (keep the current status when editing a live listing). */
  const submit = async (status) => {
    setSubmitError('');
    setPhotoError('');
    const valid = await trigger();
    if (!valid) {
      const first = Object.keys(form.formState.errors)[0];
      const target = steps.findIndex((s) => s.id === FIELD_STEP[first]);
      if (target >= 0) setStepIndex(target);
      return;
    }
    if (status === 'listed' && photoCount === 0) {
      setStepIndex(steps.findIndex((s) => s.id === 'photos'));
      return setPhotoError('Add at least one photo to publish. You can also save a draft without photos.');
    }
    setBusy(true);
    setProgress(files.length ? 0 : null);
    try {
      const payload = toDevicePayload(getValues(), { coords, status });
      if (editing && removed.length) payload.removePhotoIds = removed;
      if (!editing && accepted) payload.aiSuggestion = JSON.stringify(toSavedSuggestion(accepted));
      const saved = editing
        ? await deviceApi.update(listing._id, payload, files, setProgress)
        : await deviceApi.create(payload, files, setProgress);
      const live = saved.status === 'listed';
      navigate('/dashboard/listings', {
        replace: true,
        state: { flash: live ? `“${saved.title}” is live.` : `“${saved.title}” saved as a draft.`, listingId: saved._id },
      });
    } catch (err) {
      const apiError = toApiError(err);
      const matched = applyFieldErrors(apiError, setError, Object.keys(FIELD_STEP));
      if (apiError.fieldErrors.photos) {
        setStepIndex(steps.findIndex((s) => s.id === 'photos'));
        setPhotoError(apiError.fieldErrors.photos);
      } else if (matched) {
        const first = Object.keys(apiError.fieldErrors).find((f) => FIELD_STEP[f]);
        setStepIndex(Math.max(0, steps.findIndex((s) => s.id === FIELD_STEP[first])));
      } else {
        setSubmitError(apiError.message);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const values = getValues();
  const e = (name) => errors[name]?.message;
  const categoryName = categories.find((c) => c.slug === values.category)?.name || values.category;

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s.id} aria-current={i === stepIndex ? 'step' : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${i === stepIndex ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : i < stepIndex ? 'bg-primary/15 text-primary dark:text-primary-tint' : 'bg-black/5 text-ink-muted dark:bg-white/10'}`}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white/30 text-[11px]">{i < stepIndex ? <Check size={12} aria-hidden /> : i + 1}</span>
            {s.title}
          </li>
        ))}
      </ol>

      <GlassCard>
        <form onSubmit={(ev) => ev.preventDefault()} noValidate aria-label={`${step.title} step`}>
          {step.id === 'details' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Tell us about the device</h2>
              <TextField label="Device name *" placeholder="e.g. Dell Inspiron 15 laptop" error={e('name')} {...register('name')} />
              <TextField as="select" label="Category *" error={e('category')} {...register('category')}>
                <option value="">Choose a category…</option>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </TextField>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Brand" error={e('brand')} {...register('brand')} />
                <TextField label="Model" error={e('model')} {...register('model')} />
                <TextField label="Purchase year" inputMode="numeric" placeholder="2019" error={e('purchaseYear')} {...register('purchaseYear')} />
              </div>
              <TextField as="textarea" rows={4} label="Description" hint="What works, what doesn't, accessories included…" error={e('description')} {...register('description')} />
            </div>
          )}

          {step.id === 'photos' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Condition and photos</h2>
              <TextField as="select" label="Condition *" error={e('condition')} {...register('condition')}>
                <option value="">Choose the condition…</option>
                {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </TextField>
              <div>
                <p className="mb-1 text-sm font-medium text-ink dark:text-white">Photos</p>
                <PhotoPicker existing={existing} files={files} onFiles={setFiles} removed={removed} onRemoved={setRemoved} error={photoError} />
                <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">At least one photo is needed to publish. Drafts can be saved without photos.</p>
              </div>
              {!editing && <AiSuggestion getText={() => ({ title: getValues('name'), description: getValues('description') })} photo={files[0] || null} onUse={useSuggestion} />}
            </div>
          )}

          {step.id === 'service' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Service and location</h2>
              <TextField as="select" label="What should happen to it? *" error={e('preferredService')} {...register('preferredService')}>
                <option value="">Choose a service…</option>
                {SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </TextField>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Expected price (₹)" type="number" min="0" inputMode="numeric" hint="Leave empty for “price on request”, or 0 to give it away." error={e('expectedPrice')} {...register('expectedPrice')} />
                <TextField as="select" label="Handover" error={e('pickupPreference')} {...register('pickupPreference')}>
                  <option value="">No preference</option>
                  {PICKUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </TextField>
                <TextField label="Area / locality" error={e('addressArea')} {...register('addressArea')} />
                <TextField label="City" error={e('city')} {...register('city')} />
              </div>
              <div className="glass-subtle p-4">
                <p className="text-sm text-ink dark:text-[#E8F1EB]">Your exact location stays private. Others only see an approximate area.</p>
                <button type="button" className="btn btn-glass mt-3" onClick={locate}><LocateFixed size={16} aria-hidden /> Use my current location</button>
                <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]" role="status">
                  {geoMessage || (coords ? 'Location saved.' : hadLocation ? 'A location is already saved for this listing.' : 'No exact location set (optional).')}
                </p>
              </div>
            </div>
          )}

          {step.id === 'safety' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Protect your data</h2>
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Please confirm each point before the device goes live. You can skip this by saving a draft.</p>
              <ul className="space-y-3">
                {CHECKLIST.map((text, i) => (
                  <li key={text}>
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-ink dark:text-[#E8F1EB]">
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#047857]" checked={checks[i]} onChange={(ev) => setChecks((c) => c.map((v, j) => (j === i ? ev.target.checked : v)))} />
                      <span>{text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.id === 'review' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Review your listing</h2>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {[
                  ['Device', values.name],
                  ['Category', categoryName],
                  ['Brand / model', [values.brand, values.model].filter(Boolean).join(' ')],
                  ['Condition', labelOf(CONDITIONS, values.condition)],
                  ['Service', labelOf(SERVICES, values.preferredService)],
                  ['Price', values.expectedPrice === '' ? 'Price on request' : formatPrice(Number(values.expectedPrice))],
                  ['Handover', values.pickupPreference ? labelOf(PICKUPS, values.pickupPreference) : 'No preference'],
                  ['Place', [values.addressArea, values.city].filter(Boolean).join(', ')],
                  ['Photos', `${photoCount} of ${MAX_PHOTOS}`],
                ].map(([k, v]) => v && (
                  <div key={k} className="flex justify-between gap-3 border-b border-black/5 py-1.5 dark:border-white/10">
                    <dt className="text-ink-muted dark:text-[#9FB2A7]">{k}</dt>
                    <dd className="text-right font-medium text-ink dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
              {photoCount === 0 && <Alert variant="info">No photos yet. You can save a draft now and add photos later.</Alert>}
              <Alert variant="error">{submitError || photoError}</Alert>
              {progress !== null && (
                <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div className="h-full bg-secondary transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn btn-glass" onClick={stepIndex === 0 ? () => navigate(-1) : goBack} disabled={busy}>
              <ArrowLeft size={16} aria-hidden /> {stepIndex === 0 ? 'Cancel' : 'Back'}
            </button>
            {step.id !== 'review' ? (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Next <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {liveEdit ? (
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(undefined)}>{busy ? 'Saving…' : 'Save changes'}</button>
                ) : (
                  <>
                    <button type="button" className="btn btn-glass" disabled={busy} onClick={() => submit('draft')}>{busy ? 'Saving…' : 'Save as draft'}</button>
                    <button type="button" className="btn btn-primary" disabled={busy || !allChecked} title={allChecked ? undefined : 'Confirm the data-protection checklist first'} onClick={() => submit('listed')}>
                      {busy ? 'Publishing…' : 'Publish listing'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {step.id === 'review' && !liveEdit && !allChecked && (
            <p className="mt-2 text-right text-xs text-ink-muted dark:text-[#9FB2A7]">
              To publish, <button type="button" className="font-semibold underline" onClick={() => setStepIndex(steps.findIndex((s) => s.id === 'safety'))}>confirm the data-protection checklist</button>.
            </p>
          )}
        </form>
      </GlassCard>
    </div>
  );
}
