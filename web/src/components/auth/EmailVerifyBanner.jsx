import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { MailWarning } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import TextField from '../ui/TextField';
import { authApi } from '../../services/authApi';
import { loadMe } from '../../store/authSlice';
import { toApiError } from '../../utils/errors';

/** Asks an unverified person for the 6-digit code that was emailed to them. */
export default function EmailVerifyBanner({ email }) {
  const dispatch = useDispatch();
  const [state, setState] = useState({ busy: false, message: '', variant: 'info' });
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');

  const resend = async () => {
    setState({ busy: true, message: '', variant: 'info' });
    try {
      const res = await authApi.resendVerification();
      // "console" means the server has no email service set up, so nothing reached an inbox.
      if (res?.delivery === 'console') {
        setState({ busy: false, message: 'The server has no email service set up, so no email was sent. Ask the administrator to set up the email service.', variant: 'error' });
      } else {
        setState({ busy: false, message: `A new code was sent to ${email}. It is valid for 15 minutes.`, variant: 'success' });
      }
    } catch (err) {
      setState({ busy: false, message: toApiError(err).message, variant: 'error' });
    }
  };

  const verify = async (ev) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setProblem('Enter the 6-digit code from your email.');
    setProblem('');
    setState({ busy: true, message: '', variant: 'info' });
    try {
      await authApi.verifyEmailCode(code.trim());
      await dispatch(loadMe());
    } catch (err) {
      setState({ busy: false, message: '', variant: 'info' });
      setProblem(toApiError(err).message);
    }
  };

  return (
    <GlassCard className="space-y-3">
      <div className="flex items-start gap-3">
        <MailWarning aria-hidden className="mt-0.5 shrink-0 text-warning" size={22} />
        <div>
          <p className="font-semibold text-ink dark:text-white">Verify your email address</p>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">We emailed a 6-digit code to <strong>{email}</strong>. Enter it below to finish. Check your spam folder if you cannot see it.</p>
        </div>
      </div>
      <form onSubmit={verify} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TextField
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          error={problem}
          className="sm:max-w-[12rem]"
        />
        <button type="submit" className="btn btn-primary" disabled={state.busy}>{state.busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="btn btn-glass" onClick={resend} disabled={state.busy}>Resend verification email</button>
      </form>
      {state.message && <Alert variant={state.variant}>{state.message}</Alert>}
    </GlassCard>
  );
}
