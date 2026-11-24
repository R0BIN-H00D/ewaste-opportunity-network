import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Alert from '../../components/ui/Alert';
import { useAuth } from '../../hooks/useAuth';
import { isLockedProvider, welcomed } from '../../store/authSlice';
import AvatarSection from './settings/AvatarSection';
import AccountSection from './settings/AccountSection';
import EmailSection from './settings/EmailSection';
import ProfileSection from './settings/ProfileSection';
import RoleProfileSection from './settings/RoleProfileSection';
import VerificationSection from './settings/VerificationSection';
import SecuritySection from './settings/SecuritySection';
import DangerSection from './settings/DangerSection';

export default function Settings() {
  const { user, profile, isProvider } = useAuth();
  const { hash } = useLocation();
  const dispatch = useDispatch();
  const justRegistered = useSelector((s) => s.auth.justRegistered);
  const verificationStatus = useSelector((s) => s.auth.verification?.status);
  const [showWelcome] = useState(justRegistered); // kept for this visit even after the flag is cleared

  // The one-time redirect after sign-up has done its job once this page is open.
  useEffect(() => {
    if (justRegistered) dispatch(welcomed());
  }, [justRegistered, dispatch]);

  // Deep links such as /dashboard/settings#verification
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  if (!user) return null;
  const lockedNow = isLockedProvider(user, { status: verificationStatus });
  const checks = [
    ['a profile photo', Boolean(user.avatar?.url)],
    ['a phone number', Boolean(user.phone)],
    ['a verified email', Boolean(user.emailVerified)],
    ...(user.role !== 'admin' ? [['your address', Boolean(profile?.addressLine)], ['your city', Boolean(profile?.city)], ['your pincode', Boolean(profile?.pincode)], ['your location', Boolean(profile?.location?.coordinates)]] : []),
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const percent = Math.round((done / checks.length) * 100);
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Profile</h1>
        <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">Your photo, contact details, address and account security, all in one place.</p>
      </div>
      {lockedNow && (
        <Alert variant="info">
          {verificationStatus === 'pending'
            ? 'Your documents are being reviewed. The rest of the dashboard opens as soon as an administrator approves you.'
            : 'Verify your account to unlock the rest of the dashboard. Until then only your profile and Report a problem are open.'}
        </Alert>
      )}
      {showWelcome && <Alert variant="info">Welcome! Start by filling in your profile, then verify your email below.</Alert>}
      <AvatarSection strength={{ percent, missing }} />
      {isProvider && <VerificationSection />}
      <AccountSection />
      <EmailSection codeAlreadySent={showWelcome} />
      {user.role !== 'admin' && <ProfileSection />}
      {isProvider && <RoleProfileSection />}
      <SecuritySection />
      <DangerSection />
    </div>
  );
}
