import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../../services/authApi';
import { setAccessToken } from '../../../services/api';
import { useSave } from '../../../hooks/useSave';
import { changePasswordSchema } from '../../../lib/validation';
import { signedOut } from '../../../store/authSlice';
import { applyFieldErrors } from '../../../utils/errors';
import PasswordField from '../../../components/ui/PasswordField';
import Section from './Section';

export default function SecuritySection() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const save = useSave();
  const out = useSave();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    const { ok, error, result } = await save.run(() => authApi.changePassword({ currentPassword, newPassword }), 'Password changed. Other devices were signed out.');
    if (ok) {
      setAccessToken(result.accessToken); // this device gets a fresh session
      reset();
    } else applyFieldErrors(error, setError, ['currentPassword', 'newPassword']);
  };

  const logoutAll = async () => {
    const { ok } = await out.run(() => authApi.logoutAll(), 'Signed out everywhere');
    if (ok) {
      setAccessToken(null);
      dispatch(signedOut());
      navigate('/login', { replace: true });
    }
  };

  return (
    <Section id="security" title="Password and sessions" save={save.status === 'idle' ? out : save}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <PasswordField label="Current password" autoComplete="current-password" className="sm:col-span-2" error={errors.currentPassword?.message} {...register('currentPassword')} />
        <PasswordField label="New password" autoComplete="new-password" hint="8+ characters with a letter and a number" error={errors.newPassword?.message} {...register('newPassword')} />
        <PasswordField label="Confirm new password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        <div className="mt-1 flex justify-end border-t border-black/5 pt-5 dark:border-white/10 sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
      <div className="flex flex-col gap-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink dark:text-white">Sessions</p>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Lost a device or used a shared computer? End every active session.</p>
        </div>
        <button type="button" className="btn btn-glass shrink-0" onClick={logoutAll} disabled={out.saving}>
          {out.saving ? 'Signing out…' : 'Sign out of all devices'}
        </button>
      </div>
    </Section>
  );
}
