import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, LocateFixed } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import TextField from '../ui/TextField';
import Alert from '../ui/Alert';
import PhotoPicker from './PhotoPicker';
import AiAssist from './AiAssist';
import { useCategories } from '../../hooks/useCategories';
import { useAuth } from '../../hooks/useAuth';
import { aiApi } from '../../services/aiApi';
import { deviceApi } from '../../services/deviceApi';
import { geoApi } from '../../services/geoApi';
import { applyFieldErrors, toApiError } from '../../utils/errors';
import { CONDITIONS, LISTABLE_SERVICES, MAX_PHOTOS, PICKUPS, SERVICES, REQUIRED_PARTS, requiredPartsFor, conditionRows, formatPrice, labelOf, midPrice, partsFor, priceRangeText, suggestCondition } from '../../lib/devices';
import { CHECKLIST, EMPTY_VALUES, STEP_FIELDS, normalizePhone, deviceEditSchema, deviceSchema, listingToValues, toDevicePayload } from '../../lib/deviceSchema';

const FIELD_STEP = Object.fromEntries(Object.entries(STEP_FIELDS).flatMap(([step, fields]) => fields.map((f) => [f, step])));

/**
 * Multi-step form used to create a listing (mode="create") or change one (mode="edit", pass `listing`).
 * Steps: photos & details (photos first, then the device, then its condition, all on one page) -> service & location ->
 * data-protection checklist -> review.
 * The checklist is skipped when editing a listing that is already live.
 */
export default function DeviceForm({ mode = 'create', listing }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const { user } = useAuth();
  // The phone number from the person's profile, when it is a valid Indian mobile number.
  const profilePhone = (() => { const n = normalizePhone(user?.phone); return /^[6-9]\d{9}$/.test(n) ? n : ''; })();
  const editing = mode === 'edit';
  const liveEdit = editing && listing.status === 'listed';

  const steps = useMemo(
    () => [
      { id: 'details', title: 'Photos & details' },
      { id: 'service', title: 'Service & location' },
      ...(liveEdit ? [] : [{ id: 'safety', title: 'Data protection' }]),
      { id: 'review', title: 'Review' },
    ],
    [liveEdit],
  );

  const form = useForm({
    resolver: zodResolver(editing ? deviceEditSchema : deviceSchema),
    mode: 'onTouched',
    defaultValues: editing ? listingToValues(listing) : { ...EMPTY_VALUES, agentPhone: profilePhone },
  });
  const { register, trigger, getValues, setValue, setError, watch, formState: { errors } } = form;

  // The category <select> has no options until the list arrives, so re-apply the saved value once it does.
  const savedCategory = editing ? listing.category?.slug : '';
  useEffect(() => {
    if (savedCategory && categories.length) setValue('category', savedCategory);
  }, [savedCategory, categories.length, setValue]);

  const parts = partsFor(watch('category'));
  const answered = Object.fromEntries(parts.map((p) => [p.key, watch(`conditionDetails.${p.key}`)]));
  const suggested = suggestCondition(answered);
  const required = requiredPartsFor(watch('category'));
  const optional = parts.filter((p) => !REQUIRED_PARTS.includes(p.key));
  // The other parts stay folded away, unless one of them already has an answer (an edit).
  const [showMore, setShowMore] = useState(() => Boolean(editing && optional.some((p) => listing.conditionDetails?.[p.key])));
  // A price the AI expects for this device: asked for when the person reaches the price, or by the AI helper on the first page.
  const [priceHint, setPriceHint] = useState({ status: 'idle', range: null });
  const [stepIndex, setStepIndex] = useState(0);
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [checks, setChecks] = useState(CHECKLIST.map(() => false));
  const [coords, setCoords] = useState(null);
  const [geoMessage, setGeoMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);

  const existing = editing ? listing.device?.photos || [] : [];
  const askPrice = async () => {
    setPriceHint({ status: 'loading', range: null });
    const v = getValues();
    const words = [v.name, v.brand, v.model, v.condition && `Condition: ${labelOf(CONDITIONS, v.condition)}`, ...conditionRows(v.conditionDetails || {}).map(([k, a]) => `${k}: ${a}`), v.conditionNote].filter(Boolean).join('. ');
    try {
      const result = await aiApi.analyzeDevice(files.slice(0, 3), words);
      setPriceHint({ status: 'done', range: result.estimate?.resale || null });
    } catch {
      setPriceHint({ status: 'done', range: null });
    }
  };
  const photoCount = existing.filter((p) => !removed.includes(p.publicId)).length + files.length;
  const step = steps[stepIndex];
  useEffect(() => {
    if (step.id === 'service' && !editing && priceHint.status === 'idle') askPrice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  const allChecked = checks.every(Boolean);
  const [checklistError, setChecklistError] = useState('');
  const hadLocation = Boolean(editing && listing.location);

  /** Battery, screen, ports and buttons, and water damage must be answered for a new listing (where the category has them). */
  const checkParts = () => {
    if (editing) return true;
    const answers = getValues('conditionDetails') || {};
    let ok = true;
    for (const part of requiredPartsFor(getValues('category'))) {
      if (!answers[part.key]) {
        ok = false;
        setError(`conditionDetails.${part.key}`, { type: 'required', message: `Choose the ${part.label.toLowerCase()} condition` });
      }
    }
    return ok;
  };

  const goNext = async () => {
    // Every data-protection box must be ticked to carry on; there is no way around it.
    if (step.id === 'safety' && !allChecked) return setChecklistError('Please tick all three boxes to continue.');
    const fields = STEP_FIELDS[step.id];
    const fieldsOk = !fields || (await trigger(fields, { shouldFocus: true }));
    // A device needs at least one picture, so people can judge it. Checked on the first page, with the details.
    if (step.id === 'details' && photoCount === 0) setPhotoError('Add at least one photo of the device.');
    else if (step.id === 'details') setPhotoError('');
    const partsOk = step.id !== 'details' || checkParts();
    if (!fieldsOk || !partsOk || (step.id === 'details' && photoCount === 0)) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  /** Finds where the person is, then fills in the area and city from that spot (they can still change them). */
  const locate = () => {
    if (!navigator.geolocation) return setGeoMessage('Your browser cannot share its location. Please type the area and city.');
    setGeoMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setCoords({ lat, lng });
        try {
          const place = await geoApi.reverse(lat, lng);
          if (place.area) setValue('addressArea', place.area, { shouldValidate: true, shouldDirty: true });
          if (place.city) setValue('city', place.city, { shouldValidate: true, shouldDirty: true });
          const missing = [!place.area && 'area', !place.city && 'city'].filter(Boolean);
          setGeoMessage(missing.length
            ? `Location saved. Please type the ${missing.join(' and ')}. Others only ever see an approximate area.`
            : 'Location found. Area and city are filled in; check them. Others only ever see an approximate area.');
        } catch {
          setGeoMessage('Location saved, but we could not look up the address just now. Please type the area and city.');
        }
      },
      () => setGeoMessage('Could not get your location. Please type the area and city.'),
      { timeout: 10000 },
    );
  };

  /** status: 'draft' | 'listed' | undefined (keep the current status when editing a live listing). */
  const submit = async (status) => {
    setSubmitError('');
    setPhotoError('');
    const valid = (await trigger()) && checkParts();
    if (!valid) {
      const first = Object.keys(form.formState.errors)[0];
      const target = steps.findIndex((s) => s.id === FIELD_STEP[first]);
      if (target >= 0) setStepIndex(target);
      return;
    }
    if (photoCount === 0) {
      setStepIndex(steps.findIndex((s) => s.id === 'details'));
      return setPhotoError('Add at least one photo of the device.');
    }
    setBusy(true);
    setProgress(files.length ? 0 : null);
    try {
      const payload = toDevicePayload(getValues(), { coords, status, editing });
      if (editing && removed.length) payload.removePhotoIds = removed;
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
        setStepIndex(steps.findIndex((s) => s.id === 'details'));
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
  const priceHintNode = priceHint.status === 'loading'
    ? 'Asking the AI what this device is worth…'
    : priceHint.range
      ? (
        <span>
          AI expects about <strong>{priceRangeText(priceHint.range)}</strong> (a rough estimate).{' '}
          <button type="button" className="font-semibold text-primary underline dark:text-primary-tint" onClick={() => setValue('expectedPrice', String(midPrice(priceHint.range)), { shouldValidate: true, shouldDirty: true })}>Use {formatPrice(midPrice(priceHint.range))}</button>
        </span>
      )
      : (
        <span>
          {priceHint.status === 'done' ? 'The AI could not suggest a price just now. ' : ''}Leave empty for “price on request”, or 0 to give it away.{' '}
          {!editing && <button type="button" className="font-semibold text-primary underline dark:text-primary-tint" onClick={askPrice}>Ask the AI for a price</button>}
        </span>
      );
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
            <div className="space-y-8">
              <section className="space-y-4" aria-label="Photos">
                <h2 className="text-xl font-bold text-ink dark:text-white">Add photos of the device</h2>
                <div>
                  <PhotoPicker existing={existing} files={files} onFiles={setFiles} removed={removed} onRemoved={setRemoved} error={photoError} />
                  <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">At least one photo is needed. JPEG, PNG or WebP, up to 5 MB each.</p>
                </div>
                {!editing && <AiAssist files={files} getValues={getValues} setValue={setValue} categories={categories} onApplied={setAiNote} onEstimate={(range) => setPriceHint({ status: 'done', range })} />}
                <Alert variant="success">{aiNote}</Alert>
              </section>

              <section className="space-y-4" aria-label="The device">
                <h2 className="text-xl font-bold text-ink dark:text-white">Tell us about the device</h2>
                <TextField label="Device name *" placeholder="e.g. Dell Inspiron 15 laptop" error={e('name')} {...register('name')} />
                <TextField as="select" label="Category *" error={e('category')} {...register('category')}>
                  <option value="">Choose a category…</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </TextField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Brand *" error={e('brand')} {...register('brand')} />
                  <TextField label="Model *" error={e('model')} {...register('model')} />
                  <TextField label="Model year *" inputMode="numeric" placeholder="2018" hint="The year this model came out." error={e('modelYear')} {...register('modelYear')} />
                  <TextField label="Purchase year *" inputMode="numeric" placeholder="2019" hint="Same as or after the model year." error={e('purchaseYear')} {...register('purchaseYear')} />
                </div>
              </section>

              <section className="space-y-4" aria-label="Condition of the device">
                <h2 className="text-xl font-bold text-ink dark:text-white">Condition of the device</h2>
                <TextField as="select" label="Condition *" error={e('condition')} {...register('condition')}>
                  <option value="">Choose the condition…</option>
                  {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </TextField>
                {suggested && suggested !== watch('condition') && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]" role="status">
                    Based on your answers below we suggest: <strong>{labelOf(CONDITIONS, suggested)}</strong>
                    <button type="button" className="btn btn-glass !min-h-0 !px-3 !py-1 text-xs" onClick={() => setValue('condition', suggested, { shouldValidate: true, shouldDirty: true })}>Use this</button>
                  </p>
                )}
                <fieldset className="space-y-3" aria-label="Condition of each part">
                  <legend className="mb-1 text-sm font-semibold text-ink dark:text-white">Condition of each part</legend>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Battery, screen, ports and buttons, and water damage are needed. Press “Show more” for the other parts, which are optional.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {required.map((p) => (
                      <TextField key={p.key} as="select" label={`${p.label} *`} error={errors.conditionDetails?.[p.key]?.message} {...register(`conditionDetails.${p.key}`)}>
                        <option value="">Choose…</option>
                        {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </TextField>
                    ))}
                    {showMore && optional.map((p) => (
                      <TextField key={p.key} as="select" label={p.label} {...register(`conditionDetails.${p.key}`)}>
                        <option value="">Not stated</option>
                        {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </TextField>
                    ))}
                  </div>
                  {optional.length > 0 && (
                    <button type="button" className="btn btn-glass" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>
                      {showMore ? 'Show fewer details' : `Show more (${optional.length})`}
                    </button>
                  )}
                </fieldset>
                <TextField as="textarea" rows={2} label="Anything more about its condition? (optional)" placeholder="e.g. Small scratch on the lid, battery lasts about 2 hours." hint="Optional. A few words help buyers and technicians know what to expect." maxLength={500} error={e('conditionNote')} {...register('conditionNote')} />
              </section>
            </div>
          )}

          {step.id === 'service' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink dark:text-white">Service and location</h2>
              <TextField as="select" label="What should happen to it? *" error={e('preferredService')} {...register('preferredService')}>
                <option value="">Choose a service…</option>
                {SERVICES.filter(([v]) => LISTABLE_SERVICES.includes(v) || v === values.preferredService).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </TextField>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Expected price (₹)" type="number" min="0" step="0.01" inputMode="decimal" hint={priceHintNode} error={e('expectedPrice')} {...register('expectedPrice')} />
                <TextField as="select" label="Handover *" error={e('pickupPreference')} {...register('pickupPreference')}>
                  <option value="">Choose a handover option…</option>
                  {PICKUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </TextField>
                <TextField label="Area / locality *" error={e('addressArea')} {...register('addressArea')} />
                <TextField label="City *" error={e('city')} {...register('city')} />
                <TextField label="Your phone number *" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" hint="Your 10-digit mobile number, so the person handling the delivery can reach you. It is not shown publicly." error={e('agentPhone')} className="sm:col-span-2" {...register('agentPhone')} />
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
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Please confirm every point below. You cannot continue until all three boxes are ticked.</p>
              <ul className="space-y-3">
                {CHECKLIST.map((text, i) => (
                  <li key={text}>
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-ink dark:text-[#E8F1EB]">
                      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#047857]" checked={checks[i]} onChange={(ev) => { setChecklistError(''); setChecks((c) => c.map((v, j) => (j === i ? ev.target.checked : v))); }} required aria-invalid={checklistError && !checks[i] ? 'true' : undefined} />
                      <span>{text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {checklistError && <p role="alert" className="text-sm font-medium text-danger">{checklistError}</p>}
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
                  ['Condition note', values.conditionNote],
                  ...conditionRows(Object.fromEntries(parts.map((p) => [p.key, values.conditionDetails?.[p.key]]))),
                  ['Service', labelOf(SERVICES, values.preferredService)],
                  ['Price', values.expectedPrice === '' ? 'Price on request' : formatPrice(Number(values.expectedPrice))],
                  ['Handover', labelOf(PICKUPS, values.pickupPreference)],
                  ['Place', [values.addressArea, values.city].filter(Boolean).join(', ')],
                  ['Phone', values.agentPhone],
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
                    <button type="button" className="btn btn-glass" disabled={busy || !allChecked} title={allChecked ? undefined : 'Confirm the data-protection checklist first'} onClick={() => submit('draft')}>{busy ? 'Saving…' : 'Save as draft'}</button>
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
