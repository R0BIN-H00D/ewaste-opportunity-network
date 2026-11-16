import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
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

  // Deep links such as /dashboard/settings#verification
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Settings</h1>
      <AvatarSection />
      <AccountSection />
      <ProfileSection />
      {isProvider && <RoleProfileSection />}
      {isProvider && <VerificationSection />}
      <SecuritySection />
      <DangerSection />
    </div>
  );
}
