import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useCategories } from '../../hooks/useCategories';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { opportunityApi } from '../../services/learningApi';
import { DIFFICULTIES, endOfDayIso, parseSkills, skillsToText, toDateInput } from '../../lib/learning';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

const FIELDS = ['title', 'description', 'deviceTypeId', 'requiredSkills', 'difficulty', 'locationArea', 'deadline', 'seats', 'expectedHours', 'supervisionAcknowledged'];
const EMPTY = { title: '', description: '', deviceTypeId: '', skills: '', difficulty: 'beginner', locationArea: '', deadline: '', seats: '1', expectedHours: '', acknowledged: false };

function validate(v, editing) {
  const e = {};
  if (v.title.trim().length < 5) e.title = 'Give the task a clear title of at least 5 characters.';
  if (!v.deviceTypeId) e.deviceTypeId = 'Choose the type of device the task is about.';
  if (v.locationArea.trim().length < 2) e.locationArea = 'Enter the area or locality, not a full address.';
  if (!v.deadline) e.deadline = 'Choose the last day students can apply.';
  else if (!editing && new Date(endOfDayIso(v.deadline)) <= new Date()) e.deadline = 'The deadline must be in the future.';
  const seats = Number(v.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 20) e.seats = 'Enter a whole number from 1 to 20.';
  if (v.expectedHours.trim() !== '') {
    const h = Number(v.expectedHours);
    if (Number.isNaN(h) || h < 1 || h > 200) e.expectedHours = 'Enter hours from 1 to 200, or leave it empty.';
  }
  if (parseSkills(v.skills).length > 10) e.skills = 'List up to 10 skills.';
  if (!editing && !v.acknowledged) e.acknowledged = 'Confirm that you will supervise and that no hazardous handling is involved.';
  return e;
}

function Form({ task }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const editing = Boolean(task);
  const save = useSave();
  const [values, setValues] = useState(() => (task
    ? { title: task.title, description: task.description || '', deviceTypeId: task.deviceType?._id || '', skills: skillsToText(task.requiredSkills), difficulty: task.difficulty, locationArea: task.locationArea, deadline: toDateInput(task.deadline), seats: String(task.seats), expectedHours: task.expectedHours ? String(task.expectedHours) : '', acknowledged: true }
    : EMPTY));
  const [errors, setErrors] = useState({});
  const set = (name) => (e) => { setValues((v) => ({ ...v, [name]: e.target.value })); setErrors((er) => ({ ...er, [name]: undefined })); };

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(values, editing);
    setErrors(found);
    if (Object.keys(found).length) return null;
    const body = {
      title: values.title.trim(),
      description: values.description.trim(),
      deviceTypeId: values.deviceTypeId,
      requiredSkills: parseSkills(values.skills),
      difficulty: values.difficulty,
      locationArea: values.locationArea.trim(),
      seats: Number(values.seats),
    };
    if (!editing || toDateInput(task.deadline) !== values.deadline) body.deadline = endOfDayIso(values.deadline);
    if (values.expectedHours.trim() !== '') body.expectedHours = Number(values.expectedHours);
    if (!editing) body.supervisionAcknowledged = true;

    const res = await save.run(() => (editing ? opportunityApi.update(task._id, body) : opportunityApi.create(body)), editing ? 'Task updated' : 'Task posted');
    if (res.ok) navigate(`/dashboard/learning-tasks/${res.result._id}`, { state: { flash: editing ? 'Your changes were saved.' : 'Your task is now open for applications.' } });
    else applyFieldErrors(res.error, (name, { message }) => setErrors((er) => ({ ...er, [name === 'requiredSkills' ? 'skills' : name === 'supervisionAcknowledged' ? 'acknowledged' : name]: message })), FIELDS);
    return res;
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5" aria-label={editing ? 'Edit student task' : 'Post a student task'}>
      <GlassCard className="grid gap-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Title" value={values.title} onChange={set('title')} error={errors.title} maxLength={140} placeholder="Diagnose a laptop that will not power on" />
        <TextField as="textarea" className="sm:col-span-2" rows={4} label="What the student will do" value={values.description} onChange={set('description')} error={errors.description} maxLength={2000} hint="Describe the steps, the tools and what the student will learn." />
        <TextField as="select" label="Device type" value={values.deviceTypeId} onChange={set('deviceTypeId')} error={errors.deviceTypeId} hint="Monitors, televisions, batteries and circuit boards are hazardous and cannot be student tasks.">
          <option value="">Choose a device type</option>
          {categories.filter((c) => !c.hazardous).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </TextField>
        <TextField as="select" label="Difficulty" value={values.difficulty} onChange={set('difficulty')} error={errors.difficulty}>
          {DIFFICULTIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="Area" value={values.locationArea} onChange={set('locationArea')} error={errors.locationArea} maxLength={100} hint="Only the area is shown, never a street address." />
        <TextField label="Apply by" type="date" value={values.deadline} onChange={set('deadline')} error={errors.deadline} />
        <TextField label="Places" type="number" inputMode="numeric" min="1" max="20" value={values.seats} onChange={set('seats')} error={errors.seats} />
        <TextField label="Expected hours (optional)" type="number" inputMode="decimal" min="1" max="200" value={values.expectedHours} onChange={set('expectedHours')} error={errors.expectedHours} />
        <TextField className="sm:col-span-2" label="Useful skills (optional)" value={values.skills} onChange={set('skills')} error={errors.skills} hint="Separate with commas, for example: multimeter, basic troubleshooting." />
      </GlassCard>

      {!editing && (
        <GlassCard className="space-y-2">
          <label className="flex items-start gap-3 text-sm text-ink dark:text-[#E8F1EB]">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={values.acknowledged} aria-invalid={errors.acknowledged ? 'true' : undefined} onChange={(e) => { setValues((v) => ({ ...v, acknowledged: e.target.checked })); setErrors((er) => ({ ...er, acknowledged: undefined })); }} />
            <span>I will supervise the student throughout, and this task does not involve handling hazardous e-waste.</span>
          </label>
          {errors.acknowledged && <p role="alert" className="text-xs font-medium text-danger dark:text-red-300">{errors.acknowledged}</p>}
        </GlassCard>
      )}

      <Alert variant="error">{save.status === 'error' ? friendlyMessage(save.error) : ''}</Alert>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Saving…' : editing ? 'Save changes' : 'Post this task'}</button>
        <Link to={editing ? `/dashboard/learning-tasks/${task._id}` : '/dashboard/learning-tasks'} className="btn btn-glass">Cancel</Link>
      </div>
    </form>
  );
}

/** Post a new student task, or edit one (/dashboard/learning-tasks/:id/edit). */
export default function LearningTaskForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const task = useFetch((signal) => opportunityApi.get(id, signal), [id], { enabled: editing });

  let body;
  if (editing && task.loading && !task.data) body = <div aria-busy className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  else if (editing && task.error) body = <ErrorState error={task.error.status === 404 || task.error.status === 422 ? { message: 'This task does not exist or is not yours.' } : task.error} title="Task not found" onRetry={task.error.status === 404 ? undefined : task.reload} />;
  else if (editing && task.data.viewerRole !== 'supervisor') body = <Alert variant="info">Only the technician who posted this task can edit it.</Alert>;
  else body = <Form task={editing ? task.data : null} />;

  return (
    <div className="space-y-5">
      <Link to={editing ? `/dashboard/learning-tasks/${id}` : '/dashboard/learning-tasks'} className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> {editing ? 'Back to the task' : 'Student tasks'}</Link>
      <h1 className="text-2xl font-bold text-ink dark:text-white">{editing ? 'Edit task' : 'Post a student task'}</h1>
      {body}
    </div>
  );
}
