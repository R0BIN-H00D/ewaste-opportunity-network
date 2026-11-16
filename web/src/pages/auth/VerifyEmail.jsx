import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { authApi } from '../../services/authApi';
import { loadMe } from '../../store/authSlice';
import { useAuth } from '../../hooks/useAuth';
import { toApiError } from '../../utils/errors';
import Alert from '../../components/ui/Alert';
import AuthShell, { linkClass } from './AuthShell';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const dispatch = useDispatch();
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState({ status: token ? 'verifying' : 'missing', message: '' });
  const started = useRef(false); // links are single-use: never submit twice (StrictMode re-runs effects)

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState({ status: 'ok', message: '' }))
      .catch((err) => setState({ status: 'error', message: toApiError(err).message }));
  }, [token]);

  // Once verified AND the session is known, refresh the account so the "verify your email" banner disappears.
  useEffect(() => {
    if (state.status === 'ok' && isAuthenticated) dispatch(loadMe());
  }, [state.status, isAuthenticated, dispatch]);

  return (
    <AuthShell title="Email verification">
      {state.status === 'verifying' && <p role="status" className="text-sm text-ink-muted dark:text-[#9FB2A7]">Verifying your email…</p>}
      {state.status === 'ok' && (
        <div className="space-y-4">
          <Alert variant="success">Your email address is verified. Thank you!</Alert>
          <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary w-full">
            {isAuthenticated ? 'Go to dashboard' : 'Log in'}
          </Link>
        </div>
      )}
      {state.status === 'error' && (
        <div className="space-y-4">
          <Alert variant="error">{state.message}</Alert>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">
            Log in and use <strong>Resend verification email</strong> on your dashboard to get a fresh link.
          </p>
          <Link to="/login" className={linkClass}>Go to log in</Link>
        </div>
      )}
      {state.status === 'missing' && <Alert variant="error">This page needs the link from your verification email.</Alert>}
    </AuthShell>
  );
}
