import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch } from 'react-redux';
import { useAuth } from '../../../hooks/useAuth';
import { useSave } from '../../../hooks/useSave';
import { userApi } from '../../../services/authApi';
import { accountSchema } from '../../../lib/validation';
import { loadMe } from '../../../store/authSlice';
import { applyFieldErrors } from '../../../utils/errors';
import TextField from '../../../components/ui/TextField';
import Section from './Section';

export default function AccountSection() {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const save = useSave();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(accountSchema), defaultValues: { name: user.name, phone: user.phone || '' } });

  const onSubmit = async (values) => {
    const { ok, error } = await save.run(() => userApi.updateMe({ name: values.name, phone: values.phone || null }), 'Account updated');
    if (ok) dispatch(loadMe());
    else applyFieldErrors(error, setError, ['name', 'phone']);
  };

  return (
    <Section id="account" title="Account" save={save}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <TextField label="Phone" type="tel" autoComplete="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <TextField label="Email" value={user.email} readOnly disabled hint={user.emailVerified ? 'Verified' : 'Not verified yet'} onChange={() => {}} />
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Saving…' : 'Save account'}</button>
        </div>
      </form>
    </Section>
  );
}
