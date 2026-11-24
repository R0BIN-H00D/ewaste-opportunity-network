import { useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../../../hooks/useAuth';
import { useSave } from '../../../hooks/useSave';
import { userApi } from '../../../services/authApi';
import { assetUrl } from '../../../services/api';
import { loadMe } from '../../../store/authSlice';
import { BadgeCheck, Camera, Mail, ShieldCheck } from 'lucide-react';
import GlassCard from '../../../components/glass/GlassCard';
import Alert from '../../../components/ui/Alert';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AvatarSection({ strength }) {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const save = useSave();
  const verified = useSelector((state) => state.auth.verification?.status) === 'approved';
  const input = useRef(null);
  const [localError, setLocalError] = useState('');

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    if (!OK_TYPES.includes(file.type)) return setLocalError('Choose a JPEG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return setLocalError('The image must be 5 MB or smaller.');
    setLocalError('');
    const { ok } = await save.run(() => userApi.uploadAvatar(file), 'Photo updated');
    if (ok) dispatch(loadMe());
  };

  const remove = async () => {
    const { ok } = await save.run(() => userApi.removeAvatar(), 'Photo removed');
    if (ok) dispatch(loadMe());
  };

  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const problem = localError ? { status: 'error', message: localError } : save;
  const role = { user: 'Device owner', technician: 'Technician', refurbisher: 'Refurbisher', recycler: 'Recycler', admin: 'Administrator' }[user.role] || user.role;
  return (
    <GlassCard as="section" id="photo" aria-labelledby="photo-title" className="glass-strong scroll-mt-24 overflow-hidden !rounded-3xl !p-0">
      <div aria-hidden className="relative h-32 bg-gradient-to-r from-[#14532D] via-[#2E8B57] to-[#86C98F] sm:h-40">
        <span className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <span className="absolute right-32 top-10 h-32 w-32 rounded-full bg-white/10" />
        <span className="absolute -bottom-12 left-1/3 h-40 w-40 rounded-full bg-white/10" />
      </div>
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-start">
          <div className="relative shrink-0 self-center sm:self-auto">
            {user.avatar?.url ? (
              <img src={assetUrl(user.avatar.url)} alt="Your profile" className="h-28 w-28 rounded-full object-cover shadow-xl ring-4 ring-white dark:ring-[#1B2A22] sm:h-32 sm:w-32" />
            ) : (
              <div aria-hidden className="flex h-28 w-28 items-center justify-center rounded-full bg-primary text-3xl font-bold text-white shadow-xl ring-4 ring-white dark:bg-primary-tint dark:text-canvas-dark dark:ring-[#1B2A22] sm:h-32 sm:w-32 sm:text-4xl">{initials}</div>
            )}
            <button type="button" onClick={() => input.current?.click()} disabled={save.saving} aria-label={user.avatar ? 'Change photo' : 'Upload photo'} className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-white text-primary shadow-lg ring-1 ring-black/10 transition hover:scale-105">
              <Camera size={17} aria-hidden />
            </button>
          </div>
          <div className="min-w-0 flex-1 text-center sm:pt-[4.75rem] sm:text-left">
            <p className="truncate text-2xl font-extrabold tracking-tight text-ink dark:text-white sm:text-3xl">{user.name}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-primary-tint">{role}</span>
              {verified && <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-[#166534] dark:text-green-300"><ShieldCheck size={13} aria-hidden /> Verified</span>}
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-ink dark:bg-white/10 dark:text-white">
                {user.emailVerified ? <BadgeCheck size={14} aria-hidden className="shrink-0 text-success" /> : <Mail size={14} aria-hidden className="shrink-0" />}
                <span className="truncate">{user.email}</span>
                <span className="sr-only">{user.emailVerified ? ' (verified)' : ' (not verified)'}</span>
              </span>
            </div>
            {strength && (
              <div className="mx-auto mt-4 max-w-md sm:mx-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-ink dark:text-white">Profile strength</p>
                  <p className="font-numeric text-base font-extrabold text-primary dark:text-primary-tint">{strength.percent}%</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="progressbar" aria-valuenow={strength.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile strength">
                  <div className="h-full rounded-full bg-primary transition-all dark:bg-primary-tint" style={{ width: `${strength.percent}%` }} />
                </div>
                <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">{strength.missing.length === 0 ? 'Your profile is complete.' : `Add ${strength.missing.slice(0, 3).join(', ')}${strength.missing.length > 3 ? ' and more' : ''} to complete it.`}</p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2 sm:items-end sm:pt-[4.75rem]">
            <h2 id="photo-title" className="sr-only">Profile photo</h2>
            <div className="flex flex-wrap justify-center gap-2">
              <input ref={input} type="file" accept={OK_TYPES.join(',')} className="hidden" onChange={onPick} aria-label="Choose a profile photo" />
              <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={save.saving}>
                {save.saving ? 'Uploading…' : user.avatar ? 'Change photo' : 'Upload photo'}
              </button>
              {user.avatar && <button type="button" className="btn btn-glass" onClick={remove} disabled={save.saving}>Remove</button>}
            </div>
            <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">JPEG, PNG or WebP, up to 5 MB</p>
          </div>
        </div>
        {problem.status === 'error' && <Alert variant="error" className="mt-4">{problem.message}</Alert>}
        {problem.status === 'saved' && <Alert variant="success" className="mt-4">{problem.message}</Alert>}
      </div>
    </GlassCard>
  );
}
