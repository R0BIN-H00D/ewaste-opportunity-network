import { useSelector } from 'react-redux';
import { PROVIDER_ROLES } from '../store/authSlice';

export function useAuth() {
  const auth = useSelector((s) => s.auth);
  return {
    ...auth,
    isAuthenticated: auth.status === 'authenticated',
    isChecking: auth.status === 'idle' || auth.status === 'loading',
    isProvider: PROVIDER_ROLES.includes(auth.user?.role),
  };
}
