import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { forgotSchema } from '../../lib/validation';
import { authApi } from '../../services/authApi';
import { toApiError } from '../../utils/errors';
import TextField from '../../components/ui/TextField';
import Alert from '../../components/ui/Alert';
import AuthShell, { linkClass } from './AuthShell';

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    setFormError('');
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setFormError(toApiError(err).message);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a reset link.">
      {sent ? (
        <div className="space-y-4">
          <Alert variant="success">If that email is registered, a reset link is on its way. It is valid for 1 hour.</Alert>
          <Link to="/login" className={linkClass}>Back to log in</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Alert variant="error">{formError}</Alert>
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
          <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </button>
          <p className="text-center text-sm"><Link to="/login" className={linkClass}>Back to log in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
