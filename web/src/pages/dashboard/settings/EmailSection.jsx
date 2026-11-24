import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { BadgeCheck, MailCheck } from 'lucide-react';
import Alert from '../../../components/ui/Alert';
import TextField from '../../../components/ui/TextField';
import { useAuth } from '../../../hooks/useAuth';
import { authApi } from '../../../services/authApi';
import { loadMe } from '../../../store/authSlice';
import { toApiError } from '../../../utils/errors';
import Section from './Section';

/**
 * Email verification on the profile page. "Verify my email" sends a 6-digit code to the account's email address; typing it
 * here confirms the address. Nothing is sent until the person presses the button.
 */
export default function EmailSection({ codeAlreadySent = false }) {
  const { user } = useAuth();
  const dispatch = useDispatch();
  // A person who has just signed up was already emailed a code, so the box is there from the start.
  const [phase, setPhase] = useState(codeAlreadySent ? 'sent' : 'idle'); // idle | sending | sent | checking
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState(codeAlreadySent ? { text: `We emailed a 6-digit code to ${user.email} when you signed up. Enter it below, or send a new one. Check your spam folder if you cannot see it.`, variant: 'info' } : { text: '', variant: 'info' });

  const send = async () => {
    setPhase('sending');
    setProblem('');
    setNote({ text: '', variant: 'info' });
    try {
      const res = await authApi.resendVerification();
      // "console" means the server has no email service set up, so nothing reached an inbox.
      if (res?.delivery === 'console') {
        setPhase('idle');
        setNote({ text: 'The server has no email service set up, so no email was sent. Ask the administrator to set up the email service.', variant: 'error' });
      } else {
        setPhase('sent');
        setNote({ text: `We sent a 6-digit code to ${user.email}. It is valid for 15 minutes. Check your spam folder if you cannot see it.`, variant: 'success' });
      }
    } catch (err) {
      setPhase(code ? 'sent' : 'idle');
      setNote({ text: toApiError(err).message, variant: 'error' });
    }
  };

  const verify = async (ev) => {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setProblem('Enter the 6-digit code from your email.');
    setProblem('');
    setPhase('checking');
    try {
      await authApi.verifyEmailCode(code.trim());
      await dispatch(loadMe()); // the account now says "verified", and this card changes with it
    } catch (err) {
      setPhase('sent');
      setProblem(toApiError(err).message);
    }
  };

  if (user.emailVerified) {
    return (
      <Section id="email" title="Email">
        <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]">
          <BadgeCheck aria-hidden size={20} className="text-success" />
          <span><strong>{user.email}</strong> is verified.</span>
        </p>
      </Section>
    );
  }

  const busy = phase === 'sending' || phase === 'checking';
  return (
    <Section id="email" title="Email" description="Confirm that this email address is yours. We send a 6-digit code to it.">
      <p className="text-sm text-ink dark:text-[#E8F1EB]"><strong>{user.email}</strong> is not verified yet.</p>
      {phase === 'idle' || phase === 'sending' ? (
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy}>
          <MailCheck size={16} aria-hidden /> {phase === 'sending' ? 'Sending…' : 'Verify my email'}
        </button>
      ) : (
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
          <button type="submit" className="btn btn-primary" disabled={busy}>{phase === 'checking' ? 'Checking…' : 'Verify'}</button>
          <button type="button" className="btn btn-glass" onClick={send} disabled={busy}>Send a new code</button>
        </form>
      )}
      {note.text && <Alert variant={note.variant}>{note.text}</Alert>}
    </Section>
  );
}
