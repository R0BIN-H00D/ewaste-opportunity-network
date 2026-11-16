import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { userApi } from '../../../services/authApi';
import { setAccessToken } from '../../../services/api';
import { useSave } from '../../../hooks/useSave';
import { deleteAccountSchema } from '../../../lib/validation';
import { signedOut } from '../../../store/authSlice';
import { applyFieldErrors } from '../../../utils/errors';
import PasswordField from '../../../components/ui/PasswordField';
import Section from './Section';

export default function DangerSection() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const save = useSave();
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(deleteAccountSchema), defaultValues: { password: '' } });

  const onSubmit = async ({ password }) => {
    const { ok, error } = await save.run(() => userApi.deleteAccount(password), 'Account deleted');
    if (ok) {
      setAccessToken(null);
      dispatch(signedOut());
      navigate('/', { replace: true });
    } else applyFieldErrors(error, setError, ['password']);
  };

  return (
    <Section id="danger" title="Delete account" description="This removes your personal details and signs you out everywhere. It cannot be undone." save={save}>
      {!open ? (
        <button type="button" className="btn btn-glass text-danger dark:text-red-300" onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
          <PasswordField label="Enter your password to confirm" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn bg-danger text-white hover:brightness-110" disabled={save.saving}>{save.saving ? 'Deleting…' : 'Permanently delete'}</button>
            <button type="button" className="btn btn-glass" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </Section>
  );
}
