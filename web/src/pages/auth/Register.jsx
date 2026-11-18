import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Factory, Recycle, User, Wrench } from 'lucide-react';
import { NEEDS_ORG_NAME, ROLE_OPTIONS, registerSchema, toRegisterBody } from '../../lib/validation';
import { registerUser } from '../../store/authSlice';
import { applyFieldErrors } from '../../utils/errors';
import TextField from '../../components/ui/TextField';
import PasswordField from '../../components/ui/PasswordField';
import Alert from '../../components/ui/Alert';
import AuthShell, { linkClass } from './AuthShell';

const ICONS = { user: User, technician: Wrench, refurbisher: Recycle, recycler: Factory };
const FIELDS = ['name', 'email', 'phone', 'organizationName', 'password', 'role'];

export default function Register() {
  const dispatch = useDispatch();
  const [formError, setFormError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'user', name: '', email: '', phone: '', organizationName: '', password: '', confirmPassword: '' },
  });
  const role = watch('role');
  const isProvider = role !== 'user';

  const onSubmit = async (values) => {
    setFormError('');
    const result = await dispatch(registerUser(toRegisterBody(values)));
    if (registerUser.rejected.match(result)) {
      const err = result.payload || { message: 'Something went wrong' };
      if (!applyFieldErrors(err, setError, FIELDS)) setFormError(err.message);
      else if (err.status === 409) setFormError(err.message);
    }
  };

  return (
    <AuthShell wide title="Create your account" subtitle="Choose how you want to take part. You can change details later.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Alert variant="error">{formError}</Alert>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink dark:text-white">I am joining as</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((opt) => {
              const Icon = ICONS[opt.value];
              return (
                <div key={opt.value}>
                  <input type="radio" id={`role-${opt.value}`} value={opt.value} className="peer sr-only" {...register('role')} />
                  <label
                    htmlFor={`role-${opt.value}`}
                    className="glass-subtle flex min-h-[64px] cursor-pointer items-start gap-3 p-3 peer-checked:border-secondary-strong peer-checked:ring-2 peer-checked:ring-secondary-strong peer-focus-visible:ring-2 peer-focus-visible:ring-secondary-strong"
                  >
                    <Icon aria-hidden size={20} className="mt-0.5 shrink-0 text-secondary-strong dark:text-primary-tint" />
                    <span>
                      <span className="block text-sm font-semibold text-ink dark:text-white">{opt.label}</span>
                      <span className="block text-xs text-ink-muted dark:text-[#9FB2A7]">{opt.hint}</span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {isProvider && (
          <Alert variant="info">
            Provider accounts are reviewed by an administrator. After signing up you will upload your documents in Settings.
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Phone (optional)" type="tel" autoComplete="tel" inputMode="tel" error={errors.phone?.message} {...register('phone')} />
          {NEEDS_ORG_NAME.includes(role) && (
            <TextField
              label={role === 'recycler' ? 'Recycling centre name' : 'Business name'}
              autoComplete="organization"
              error={errors.organizationName?.message}
              {...register('organizationName')}
            />
          )}
          <PasswordField
            label="Password"
            autoComplete="new-password"
            hint="8+ characters with a letter and a number"
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordField label="Confirm password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted dark:text-[#9FB2A7]">
        Already registered? <Link to="/login" className={linkClass}>Log in</Link>
      </p>
    </AuthShell>
  );
}
