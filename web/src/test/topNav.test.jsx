import { screen, within } from '@testing-library/react';
import { TECH, USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn(), verifyEmailCode: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const LINKS = ['Home', 'How It Works', 'Browse Devices', 'Find Services', 'Marketplace'];
const top = () => within(screen.getByRole('navigation', { name: 'Primary' }));

describe('the top navigation', () => {
  it('stays above the dashboard of a normal user, next to the side panel', async () => {
    renderApp('/dashboard', signedIn(USER));
    await screen.findByRole('complementary', { name: 'Dashboard navigation' });
    for (const name of LINKS) expect(top().getAllByRole('link', { name }).length).toBeGreaterThan(0);
    expect(top().getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(top().getByRole('link', { name: /E-Waste/ })).toHaveAttribute('href', '/');
  });

  it('stays on the other pages of the dashboard too', async () => {
    renderApp('/dashboard/listings', signedIn(USER));
    await screen.findByRole('complementary', { name: 'Dashboard navigation' });
    expect(top().getAllByRole('link', { name: 'Browse Devices' }).length).toBeGreaterThan(0);
  });

  it('has no Environmental Impact link, in the dashboard or on the public pages', async () => {
    renderApp('/dashboard', signedIn(USER));
    await screen.findByRole('complementary', { name: 'Dashboard navigation' });
    expect(top().queryByRole('link', { name: 'Environmental Impact' })).not.toBeInTheDocument();
  });

  it.each([['technician', { ...TECH, status: 'active' }], ['refurbisher', { ...USER, role: 'refurbisher' }], ['recycler', { ...USER, role: 'recycler' }]])(
    'is also at the top of the dashboard of a %s, with one colour-mode switch',
    async (_role, who) => {
      renderApp('/dashboard', signedIn(who));
      await screen.findByRole('complementary', { name: 'Dashboard navigation' });
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /dark|light/i })).toHaveLength(1);
    },
  );

  it('is not added to the dashboard of an administrator', async () => {
    renderApp('/dashboard', signedIn({ ...USER, role: 'admin' }));
    await screen.findByRole('complementary', { name: 'Dashboard navigation' });
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('shows only one colour-mode switch in the dashboard of a normal user', async () => {
    renderApp('/dashboard', signedIn(USER));
    await screen.findByRole('complementary', { name: 'Dashboard navigation' });
    expect(screen.getAllByRole('button', { name: /dark|light/i })).toHaveLength(1);
  });

  it('is the same bar on the public pages for a visitor', async () => {
    renderApp('/', anonymous());
    await screen.findByRole('heading', { level: 1, name: /Give Your Electronics/ });
    for (const name of LINKS) expect(top().getAllByRole('link', { name }).length).toBeGreaterThan(0);
    expect(top().getByRole('link', { name: 'Login' })).toBeInTheDocument();
  });
});
