import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import PhotoPicker from '../../components/devices/PhotoPicker';
import { useCategories } from '../../hooks/useCategories';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { marketApi } from '../../services/marketplaceApi';
import { refurbApi } from '../../services/refurbishmentApi';
import { PRODUCT_CONDITIONS, parseSpecs, specsToText } from '../../lib/marketplace';
import { partsFor } from '../../lib/devices';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const EMPTY = { title: '', category: '', brand: '', model: '', condition: '', refurbishmentInfo: '', price: '', stock: '1', specs: '', status: 'active', conditionDetails: {}, conditionNote: '' };
// The parts a buyer looks at first; the rest sit behind "Show more" in the form, as on the device page.
const MAIN_PARTS = ['power', 'battery', 'screen', 'body'];
const FIELDS = ['title', 'category', 'brand', 'model', 'condition', 'refurbishmentInfo', 'price', 'stock', 'specs', 'status', 'photos', 'conditionDetails', 'conditionNote'];

function validate(v, photoCount) {
  const e = {};
  if (v.title.trim().length < 3) e.title = 'Enter a title of at least 3 characters.';
  if (!v.category) e.category = 'Choose a category.';
  if (!v.condition) e.condition = 'Choose the condition. Buyers always see it.';
  if (v.refurbishmentInfo.trim().length < 10) e.refurbishmentInfo = 'Say what was repaired, replaced or tested (at least 10 characters).';
  const price = Number(v.price);
  if (v.price.trim() === '' || Number.isNaN(price) || price < 0) e.price = 'Enter a price of 0 or more.';
  const stock = Number(v.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 999) e.stock = 'Enter a whole number from 0 to 999.';
  const { error } = parseSpecs(v.specs);
  if (error) e.specs = error;
  if (v.conditionNote.length > 1000) e.conditionNote = 'Keep the notes under 1000 characters.';
  if (photoCount === 0) e.photos = 'Add at least one photo of the product.';
  return e;
}

function Form({ product, job, jobPhotos }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const editing = Boolean(product);
  const fromJob = Boolean(job) || Boolean(product?.refurbishmentJob);
  const save = useSave();
  const [values, setValues] = useState(() => (product
    ? { title: product.title, category: product.category?.slug || '', brand: product.brand || '', model: product.model || '', condition: product.condition, refurbishmentInfo: product.refurbishmentInfo, price: String(product.price), stock: String(product.stock), specs: specsToText(product.specs), status: product.status === 'hidden' ? 'hidden' : 'active', conditionDetails: { ...(product.conditionDetails || {}) }, conditionNote: product.conditionNote || '' }
    : job
      ? { ...EMPTY, title: job.listing?.title || '', category: job.listing?.category?.slug || '', brand: job.listing?.brand || '', model: job.listing?.model || '' }
      : EMPTY));
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [errors, setErrors] = useState({});
  const parts = partsFor(values.category);
  const mainParts = parts.filter((p) => MAIN_PARTS.includes(p.key));
  const moreParts = parts.filter((p) => !MAIN_PARTS.includes(p.key));
  const [showMore, setShowMore] = useState(() => Boolean(product && moreParts.some((p) => product.conditionDetails?.[p.key])));
  const existing = product?.photos || [];
  const usable = existing.filter((p) => !removed.includes(p.publicId)).length + files.length + (!editing && files.length === 0 ? jobPhotos.length : 0);

  const set = (name) => (e) => { setValues((v) => ({ ...v, [name]: e.target.value })); setErrors((er) => ({ ...er, [name]: undefined })); };

  const setPart = (key) => (e) => setValues((v) => ({ ...v, conditionDetails: { ...v.conditionDetails, [key]: e.target.value } }));

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values, usable);
    setErrors(found);
    if (Object.keys(found).length) return null;

    const form = new FormData();
    form.append('title', values.title.trim());
    form.append('category', values.category);
    form.append('condition', values.condition);
    form.append('refurbishmentInfo', values.refurbishmentInfo.trim());
    form.append('price', String(Number(values.price)));
    if (values.brand.trim()) form.append('brand', values.brand.trim());
    if (values.model.trim()) form.append('model', values.model.trim());
    const { specs } = parseSpecs(values.specs);
    if (Object.keys(specs).length) form.append('specs', JSON.stringify(specs));
    // Only the parts asked about for this category that were answered; on an edit an empty set clears the old answers.
    const asked = parts.map((p) => p.key);
    const answered = Object.fromEntries(Object.entries(values.conditionDetails).filter(([k, a]) => a && asked.includes(k)));
    if (Object.keys(answered).length || editing) form.append('conditionDetails', JSON.stringify(answered));
    if (values.conditionNote.trim() || editing) form.append('conditionNote', values.conditionNote.trim());
    if (!fromJob) form.append('stock', values.stock);
    if (editing) {
      if (fromJob) form.append('stock', values.stock);
      form.append('status', values.status);
      if (removed.length) form.append('removePhotoIds', JSON.stringify(removed));
    } else if (job) {
      form.append('jobId', job._id);
    }
    files.forEach((f) => form.append('photos', f));

    const res = await save.run(() => (editing ? marketApi.update(product._id, form) : marketApi.create(form)), editing ? 'Product updated' : 'Product listed');
    if (res.ok) navigate('/dashboard/products', { state: { flash: editing ? 'Your changes were saved.' : 'Your product is now on the marketplace.' } });
    else applyFieldErrors(res.error, (name, { message }) => setErrors((er) => ({ ...er, [name]: message })), FIELDS);
    return res;
  };

  const busy = save.saving;
  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label={editing ? 'Edit product' : 'List a product'}>
      {job && <Alert variant="info">Listing the refurbished {job.listing?.title}. {jobPhotos.length > 0 ? 'Its “after” photos are used unless you add your own below.' : ''}</Alert>}
      <GlassCard className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Title" value={values.title} onChange={set('title')} error={errors.title} maxLength={140} />
        <TextField as="select" label="Category" value={values.category} onChange={set('category')} error={errors.category}>
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField as="select" label="Condition" value={values.condition} onChange={set('condition')} error={errors.condition} hint="Shown to every buyer next to the Refurbished label.">
          <option value="">Choose the condition</option>
          {PRODUCT_CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="Brand (optional)" value={values.brand} onChange={set('brand')} maxLength={60} />
        <TextField label="Model (optional)" value={values.model} onChange={set('model')} maxLength={60} />
        <TextField label="Price (₹)" type="number" inputMode="decimal" min="0" value={values.price} onChange={set('price')} error={errors.price} />
        {(!fromJob || editing) && <TextField label="Stock" type="number" inputMode="numeric" min="0" value={values.stock} onChange={set('stock')} error={errors.stock} hint={fromJob ? 'A product made from one device has a stock of 1.' : undefined} disabled={fromJob} />}
        <TextField as="textarea" className="sm:col-span-2" rows={4} label="What was done to it" value={values.refurbishmentInfo} onChange={set('refurbishmentInfo')} error={errors.refurbishmentInfo} maxLength={2000} hint="For example: new battery, fresh SSD, data wiped, all ports tested." />
        <TextField as="textarea" className="sm:col-span-2" rows={4} label="Specifications (optional)" value={values.specs} onChange={set('specs')} error={errors.specs} hint={'One per line, like "RAM: 8 GB".'} />
        {editing && (
          <TextField as="select" label="Visibility" value={values.status} onChange={set('status')} hint="A hidden product is kept but not shown on the marketplace.">
            <option value="active">On sale</option>
            <option value="hidden">Hidden</option>
          </TextField>
        )}
      </GlassCard>

      <GlassCard as="section" aria-label="Condition of each part" className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-ink dark:text-white">Condition of each part (optional)</h2>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Buyers see these in “About this device” on the product page: the working condition, battery, screen, scratches and more. The more you say, the more buyers trust the listing.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[...mainParts, ...(showMore ? moreParts : [])].map((p) => (
            <TextField key={p.key} as="select" label={p.label} value={values.conditionDetails[p.key] || ''} onChange={setPart(p.key)}>
              <option value="">Not stated</option>
              {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </TextField>
          ))}
        </div>
        {moreParts.length > 0 && (
          <button type="button" className="btn btn-glass" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>{showMore ? 'Show fewer details' : `Show more (${moreParts.length})`}</button>
        )}
        <TextField as="textarea" rows={3} label="Other notes (optional)" value={values.conditionNote} onChange={set('conditionNote')} error={errors.conditionNote} maxLength={1000} hint="Anything else a buyer should know: accessories, marks, warranty." />
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="text-lg font-bold text-ink dark:text-white">Photos</h2>
        <PhotoPicker files={files} onFiles={(f) => { setFiles(f); setErrors((er) => ({ ...er, photos: undefined })); }} existing={existing} removed={removed} onRemoved={setRemoved} error={errors.photos} />
      </GlassCard>

      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'List this product'}</button>
        <Link to="/dashboard/products" className="btn btn-glass">Cancel</Link>
      </div>
    </form>
  );
}

/** Create a product (optionally from a finished refurbishment job: /dashboard/products/new?job=ID) or edit one. */
export default function ProductForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const jobId = params.get('job');
  const editing = Boolean(id);
  const product = useFetch((signal) => marketApi.get(id, signal), [id], { enabled: editing });
  const job = useFetch((signal) => refurbApi.job(jobId, signal), [jobId], { enabled: !editing && Boolean(jobId) });
  const state = editing ? product : jobId ? job : { data: {}, loading: false, error: null };

  let body;
  if (state.loading && !state.data) body = <div aria-busy className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  else if (state.error) body = <ErrorState error={state.error.status === 404 || state.error.status === 422 ? { message: editing ? 'This product does not exist or is not yours.' : 'This job does not exist or is not yours.' } : state.error} title={editing ? 'Product not found' : 'Job not found'} onRetry={state.error.status === 404 ? undefined : state.reload} />;
  else if (!editing && jobId && !(state.data.actions || []).includes('list_product')) body = <Alert variant="info">This job is not ready to list yet. <Link to={`/dashboard/refurbishment/${jobId}`} className="font-semibold underline">Go back to the job</Link>.</Alert>;
  else body = <Form product={editing ? state.data : null} job={!editing && jobId ? state.data : null} jobPhotos={!editing && jobId ? state.data.afterPhotos || [] : []} />;

  return (
    <div className="space-y-5">
      <Link to="/dashboard/products" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> My products</Link>
      <h1 className="text-2xl font-bold text-ink dark:text-white">{editing ? 'Edit product' : 'List a product'}</h1>
      {body}
    </div>
  );
}
