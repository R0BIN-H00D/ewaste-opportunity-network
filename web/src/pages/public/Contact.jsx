import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import PageShell from '../../components/layout/PageShell';
import GlassCard from '../../components/glass/GlassCard';
import TextField from '../../components/ui/TextField';
import Alert from '../../components/ui/Alert';
import { api } from '../../services/api';
import { applyFieldErrors, toApiError } from '../../utils/errors';
import { email } from '../../lib/validation';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email,
  subject: z.string().trim().min(3, 'Enter a subject (at least 3 characters)').max(120),
  message: z.string().trim().min(10, 'Write at least 10 characters').max(2000, 'Keep the message under 2000 characters'),
});
const FIELDS = ['name', 'email', 'subject', 'message'];

export default function Contact() {
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', subject: '', message: '' },
  });
  const [status, setStatus] = useState({ type: '', text: '' });

  const onSubmit = async (values) => {
    setStatus({ type: '', text: '' });
    try {
      await api.post('/contact', values);
      reset();
      setStatus({ type: 'success', text: 'Thank you! Your message was sent. We will reply by email.' });
    } catch (err) {
      const apiError = toApiError(err);
      if (!applyFieldErrors(apiError, setError, FIELDS)) {
        setStatus({ type: 'error', text: apiError.status === 429 ? 'You have sent several messages recently. Please try again in a little while.' : apiError.message });
      }
    }
  };

  return (
    <PageShell title="Contact and support" intro="Questions, feedback or trouble with an account? Send us a message and we will reply by email.">
      <GlassCard>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4" aria-label="Contact form">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
            <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          </div>
          <TextField label="Subject" error={errors.subject?.message} {...register('subject')} />
          <TextField as="textarea" rows={6} label="Message" error={errors.message?.message} {...register('message')} />
          <Alert variant={status.type || 'info'}>{status.text}</Alert>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Sending…' : 'Send message'}</button>
        </form>
      </GlassCard>
    </PageShell>
  );
}
