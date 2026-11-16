import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDispatch } from 'react-redux';
import { z } from 'zod';
import { MapPin } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useSave } from '../../../hooks/useSave';
import { userApi } from '../../../services/authApi';
import { loadMe } from '../../../store/authSlice';
import { applyFieldErrors } from '../../../utils/errors';
import TextField from '../../../components/ui/TextField';
import Alert from '../../../components/ui/Alert';
import Section from './Section';

const FIELDS = ['bio', 'addressLine', 'addressArea', 'city', 'state', 'pincode'];
const schema = z.object({
  bio: z.string().max(500, 'At most 500 characters'),
  addressLine: z.string().max(200),
  addressArea: z.string().max(100),
  city: z.string().max(80),
  state: z.string().max(80),
  pincode: z.string().max(12),
});

export default function ProfileSection() {
  const { profile } = useAuth();
  const dispatch = useDispatch();
  const save = useSave();
  const initialLoc = profile?.location?.coordinates ? { lat: profile.location.coordinates[1], lng: profile.location.coordinates[0] } : null;
  const [loc, setLoc] = useState(initialLoc);
  const [locDirty, setLocDirty] = useState(false);
  const [geoError, setGeoError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(FIELDS.map((f) => [f, profile?.[f] || ''])),
  });

  const useMyLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) return setGeoError('Your browser does not support location.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        setLocDirty(true);
      },
      () => setGeoError('Could not get your location. You can allow it in the browser or skip this.'),
      { timeout: 10000 },
    );
  };

  const onSubmit = async (values) => {
    const body = { ...values };
    if (locDirty) body.location = loc; // null clears it
    const { ok, error } = await save.run(() => userApi.updateProfile(body), 'Profile saved');
    if (ok) {
      setLocDirty(false);
      dispatch(loadMe());
    } else applyFieldErrors(error, setError, FIELDS);
  };

  return (
    <Section id="profile" title="Profile and address" description="Your exact address and location stay private. Others only see an approximate area." save={save}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <TextField as="textarea" rows={3} label="About you" className="sm:col-span-2" error={errors.bio?.message} {...register('bio')} />
        <TextField label="Address" autoComplete="street-address" className="sm:col-span-2" error={errors.addressLine?.message} {...register('addressLine')} />
        <TextField label="Area / locality" error={errors.addressArea?.message} {...register('addressArea')} />
        <TextField label="City" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
        <TextField label="State" autoComplete="address-level1" error={errors.state?.message} {...register('state')} />
        <TextField label="Pincode" autoComplete="postal-code" inputMode="numeric" error={errors.pincode?.message} {...register('pincode')} />

        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium text-ink dark:text-white">Location</p>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{loc ? `Saved point: ${loc.lat}, ${loc.lng}` : 'No location set. It is used to find nearby technicians and centres.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-glass" onClick={useMyLocation}><MapPin size={16} aria-hidden /> Use my current location</button>
            {loc && <button type="button" className="btn btn-glass" onClick={() => { setLoc(null); setLocDirty(true); }}>Remove location</button>}
          </div>
          <Alert variant="error">{geoError}</Alert>
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-primary" disabled={save.saving}>{save.saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
    </Section>
  );
}
