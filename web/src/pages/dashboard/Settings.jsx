import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../../hooks/useAuth';
import { welcomed } from '../../store/authSlice';
import EmailVerifyBanner from '../../components/auth/EmailVerifyBanner';
import AvatarSection from './settings/AvatarSection';
import AccountSection from './settings/AccountSection';
import ProfileSection from './settings/ProfileSection';
import RoleProfileSection from './settings/RoleProfileSection';
import VerificationSection from './settings/VerificationSection';
import SecuritySection from './settings/SecuritySection';
import DangerSection from './settings/DangerSection';

export default function Settings() {
  const { user, isProvider } = useAuth();
  const { hash } = useLocation();
  const dispatch = useDispatch();
  const justRegistered = useSelector((s) => s.auth.justRegistered);
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
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Profile</h1>
      {showWelcome && <p className="text-sm text-ink dark:text-[#E8F1EB]">Welcome! Start by filling in your profile, then verify your email below.</p>}
      {!user.emailVerified && <EmailVerifyBanner email={user.email} />}
      <AvatarSection />
      <AccountSection />
      {user.role !== 'admin' && <ProfileSection />}
      {isProvider && <RoleProfileSection />}
      {isProvider && <VerificationSection />}
      <SecuritySection />
      <DangerSection />
    </div>
  );
}
