import { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useAuth } from '../../../hooks/useAuth';
import { useSave } from '../../../hooks/useSave';
import { userApi } from '../../../services/authApi';
import { assetUrl } from '../../../services/api';
import { loadMe } from '../../../store/authSlice';
import Section from './Section';

const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function AvatarSection() {
  const { user } = useAuth();
  const dispatch = useDispatch();
  const save = useSave();
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
  return (
    <Section id="photo" title="Profile photo" save={localError ? { status: 'error', message: localError } : save}>
      <div className="flex items-center gap-4">
        {user.avatar?.url ? (
          <img src={assetUrl(user.avatar.url)} alt="Your profile" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-xl font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">
            {initials}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept={OK_TYPES.join(',')} className="hidden" onChange={onPick} aria-label="Choose a profile photo" />
          <button type="button" className="btn btn-glass" onClick={() => input.current?.click()} disabled={save.saving}>
            {save.saving ? 'Uploading…' : user.avatar ? 'Change photo' : 'Upload photo'}
          </button>
          {user.avatar && <button type="button" className="btn btn-glass" onClick={remove} disabled={save.saving}>Remove</button>}
        </div>
      </div>
    </Section>
  );
}
