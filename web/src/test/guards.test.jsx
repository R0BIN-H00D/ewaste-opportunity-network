import { screen } from '@testing-library/react';
import { RequireAuth, RequireRole, RequireVerified } from '../components/auth/guards';
import { TECH, USER, anonymous, renderApp, renderRoutes, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
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
