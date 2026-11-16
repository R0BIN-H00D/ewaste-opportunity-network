import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginSchema } from '../../lib/validation';
import { loginUser } from '../../store/authSlice';
import { applyFieldErrors } from '../../utils/errors';
import TextField from '../../components/ui/TextField';
import PasswordField from '../../components/ui/PasswordField';
import Alert from '../../components/ui/Alert';
import AuthShell, { linkClass } from './AuthShell';

export default function Login() {
  const dispatch = useDispatch();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  // On success the auth state changes and <GuestOnly> redirects to where the visitor was heading.
  const onSubmit = async (values) => {
    setFormError('');
    const result = await dispatch(loginUser(values));
    if (loginUser.rejected.match(result)) {
      const err = result.payload || { message: 'Something went wrong' };
      if (!applyFieldErrors(err, setError, ['email', 'password'])) setFormError(err.message);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage your listings, requests and impact.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Alert variant="error">{formError}</Alert>
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <PasswordField label="Password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="text-right text-sm">
          <Link to="/forgot-password" className={linkClass}>Forgot password?</Link>
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted dark:text-[#9FB2A7]">
        New here? <Link to="/register" className={linkClass}>Create an account</Link>
      </p>
    </AuthShell>
  );
}
