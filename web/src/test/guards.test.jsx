import { fireEvent, screen, waitFor } from '@testing-library/react';
import { authApi } from '../services/authApi';
import { RequireAuth, RequireRole, RequireVerified } from '../components/auth/guards';
import { TECH, USER, anonymous, renderApp, renderRoutes, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn(), verifyEmailCode: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

describe('route guards in the real app', () => {
  it('sends anonymous visitors from /dashboard to the login page', async () => {
    renderApp('/dashboard', anonymous());
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows a loading state while the session is being restored (no flash of the login page)', () => {
    renderApp('/dashboard', { auth: { status: 'loading', user: null, profile: null, roleProfile: null, verification: null } });
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('lets a signed-in person in, and keeps them off the login page', async () => {
    renderApp('/dashboard', signedIn());
    expect(await screen.findByText(/Hello, Asha/)).toBeInTheDocument();
    renderApp('/login', signedIn());
    expect((await screen.findAllByText(/Hello, Asha/)).length).toBeGreaterThan(0);
  });

  it('reminds unverified people to confirm their email', async () => {
    renderApp('/dashboard', signedIn({ ...USER, emailVerified: false }));
    expect(await screen.findByText('Verify your email address')).toBeInTheDocument();
  });

  it('lets an unverified person enter the 6-digit code from their email', async () => {
    authApi.verifyEmailCode.mockResolvedValue(null);
    authApi.me.mockResolvedValue({ ...USER, emailVerified: true });
    renderApp('/dashboard', signedIn({ ...USER, emailVerified: false }));
    const input = await screen.findByLabelText('Verification code');
    fireEvent.change(input, { target: { value: '12ab' } }); // letters are dropped as they are typed
    expect(input).toHaveValue('12');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter the 6-digit code from your email.')).toBeInTheDocument();
    expect(authApi.verifyEmailCode).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(authApi.verifyEmailCode).toHaveBeenCalledWith('482913'));
  });

  it('says so when the server has no email service, and when a code is wrong', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'console' });
    authApi.verifyEmailCode.mockRejectedValue({ response: { status: 400, data: { message: 'That code is not right. 4 tries left.' } } });
    renderApp('/dashboard', signedIn({ ...USER, emailVerified: false }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByText(/no email service set up/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('That code is not right. 4 tries left.')).toBeInTheDocument();
  });

  it('keeps the settings page behind login', async () => {
    renderApp('/dashboard/settings', anonymous());
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
});

const secret = <p>secret content</p>;

describe('RequireVerified', () => {
  const routes = [{ element: <RequireAuth />, children: [{ element: <RequireVerified />, children: [{ path: '/x', element: secret }] }] }];

  it('blocks providers until an administrator approves them', async () => {
    renderRoutes(routes, '/x', signedIn(TECH, { verification: { status: 'pending' } }));
    expect(await screen.findByText('Verification required')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('lets approved providers through', async () => {
    renderRoutes(routes, '/x', signedIn({ ...TECH, status: 'active' }, { verification: { status: 'approved' } }));
    expect(await screen.findByText('secret content')).toBeInTheDocument();
  });

  it('does not gate plain users', async () => {
    renderRoutes(routes, '/x', signedIn());
    expect(await screen.findByText('secret content')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  const routes = [{ element: <RequireAuth />, children: [{ element: <RequireRole roles={['admin']} />, children: [{ path: '/admin', element: secret }] }] }];

  it('blocks other roles and allows the right one', async () => {
    const first = renderRoutes(routes, '/admin', signedIn());
    expect(await screen.findByText(/not available for your account/i)).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    first.router.dispose();
  });

  it('lets admins in', async () => {
    renderRoutes(routes, '/admin', signedIn({ ...USER, role: 'admin' }));
    expect(await screen.findByText('secret content')).toBeInTheDocument();
  });
});
