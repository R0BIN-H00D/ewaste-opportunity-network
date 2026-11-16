import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { resetSchema } from '../../lib/validation';
import { authApi } from '../../services/authApi';
import { toApiError } from '../../utils/errors';
import PasswordField from '../../components/ui/PasswordField';
import Alert from '../../components/ui/Alert';
import AuthShell, { linkClass } from './AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = async ({ password }) => {
    setFormError('');
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Reset link missing">
        <Alert variant="error">This page needs the link from your email. Request a new one below.</Alert>
        <p className="mt-4"><Link to="/forgot-password" className={linkClass}>Request a new reset link</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed out of all devices.">
      {done ? (
        <div className="space-y-4">
          <Alert variant="success">Your password was updated.</Alert>
          <Link to="/login" className="btn btn-primary w-full">Log in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Alert variant="error">{formError}</Alert>
          <PasswordField label="New password" autoComplete="new-password" hint="8+ characters with a letter and a number" error={errors.password?.message} {...register('password')} />
          <PasswordField label="Confirm new password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
