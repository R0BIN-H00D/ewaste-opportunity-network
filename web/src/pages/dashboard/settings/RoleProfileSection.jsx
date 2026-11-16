import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { useAuth } from '../../../hooks/useAuth';
import { useSave } from '../../../hooks/useSave';
import { userApi } from '../../../services/authApi';
import { ROLE_FIELDS, roleBody, roleDefaults } from '../../../lib/roleFields';
import { loadMe } from '../../../store/authSlice';
import { applyFieldErrors } from '../../../utils/errors';
import TextField from '../../../components/ui/TextField';
import Section from './Section';

export default function RoleProfileSection() {
  const { user, roleProfile } = useAuth();
  const dispatch = useDispatch();
  const save = useSave();
  const config = ROLE_FIELDS[user.role];
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: roleDefaults(user.role, roleProfile) });
  if (!config) return null;

  const onSubmit = async (values) => {
    const body = roleBody(user.role, values);
    if (!Object.keys(body).length) return save.run(async () => { throw new Error('Fill in at least one field.'); });
    const { ok, error } = await save.run(() => userApi.updateRoleProfile(body), 'Details saved');
    if (ok) dispatch(loadMe());
    else applyFieldErrors(error, setError, config.fields.map((f) => f.name));
    return undefined;
  };

  return (
    <Section id="role-details" title={config.title} description="Shown to customers once your account is verified." save={save}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        {config.fields.map((f) => (
          <TextField
            key={f.name}
            label={f.label}
            hint={f.hint}
            className={f.full ? 'sm:col-span-2' : ''}
            error={errors[f.name]?.message}
            as={f.type === 'textarea' ? 'textarea' : 'input'}
            rows={f.type === 'textarea' ? 3 : undefined}
            type={f.type === 'number' || f.type === 'date' ? f.type : f.type === 'text' || f.type === 'list' ? 'text' : undefined}
            min={f.min}
            max={f.type === 'number' ? f.max : undefined}
            maxLength={f.type === 'text' ? f.max : undefined}
            step={f.type === 'number' ? 'any' : undefined}
            {...register(f.name)}
          />
        ))}
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>
    </Section>
  );
}
