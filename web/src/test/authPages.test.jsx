import { fireEvent, screen, waitFor } from '@testing-library/react';
import { authApi } from '../services/authApi';
import { setAccessToken } from '../services/api';
import { USER, TECH, anonymous, renderApp } from './helpers';

vi.mock('../services/authApi', () => ({
  authApi: { login: vi.fn(), register: vi.fn(), me: vi.fn(), logout: vi.fn(), resendVerification: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), verifyEmail: vi.fn() },
  userApi: {},
  verificationApi: {},
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const apiError = (status, message, extra = {}) => ({ response: { status, data: { message, ...extra } } });

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
});

describe('Login page', () => {
  it('shows inline errors and does not call the API when the form is empty', async () => {
    renderApp('/login', anonymous());
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('logs in and lands on the dashboard', async () => {
    authApi.login.mockResolvedValue({ user: USER, accessToken: 'tok', expiresIn: 900 });
    authApi.me.mockResolvedValue({ user: USER, profile: {}, roleProfile: null });
    renderApp('/login', anonymous());

    type('Email', 'Asha@Test.local');
    type('Password', 'Passw0rd!x');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText(/Hello, Asha/)).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledWith({ email: 'asha@test.local', password: 'Passw0rd!x' }); // email normalised
  });

  it('shows the server message for wrong credentials and stays on the page', async () => {
    authApi.login.mockRejectedValue(apiError(401, 'Invalid email or password'));
    renderApp('/login', anonymous());
    type('Email', 'asha@test.local');
    type('Password', 'Wrong-pass1');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('lets people reveal the password', async () => {
    renderApp('/login', anonymous());
    const field = await screen.findByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});

describe('Register page', () => {
  const fill = (over = {}) => {
    const v = { 'Full name': 'Asha Rao', Email: 'asha@test.local', Password: 'Passw0rd!x', 'Confirm password': 'Passw0rd!x', ...over };
    for (const [label, value] of Object.entries(v)) type(label, value);
  };

  it('asks for an organisation name only for recycling centres and refurbishers', async () => {
    renderApp('/register', anonymous());
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.queryByLabelText('Recycling centre name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Recycling centre/));
    expect(screen.getByLabelText('Recycling centre name')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Refurbisher/));
    expect(screen.getByLabelText('Business name')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Individual/));
    expect(screen.queryByLabelText('Business name')).not.toBeInTheDocument();
  });

  it('flags mismatched passwords', async () => {
    renderApp('/register', anonymous());
    await screen.findByRole('heading', { name: 'Create your account' });
    fill({ 'Confirm password': 'Different1' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('registers a technician and shows the verification prompt on the dashboard', async () => {
    authApi.register.mockResolvedValue({ user: TECH, accessToken: 'tok', expiresIn: 900 });
    authApi.me.mockResolvedValue({ user: { ...TECH, emailVerified: false }, profile: {}, roleProfile: {}, verification: { status: 'not_submitted' } });
    renderApp('/register', anonymous());
    await screen.findByRole('heading', { name: 'Create your account' });

    fireEvent.click(screen.getByLabelText(/Technician/));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    // A new person lands on their profile first, with the email code box and the documents section for providers.
    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText(/Welcome! Start by filling in your profile/)).toBeInTheDocument();
    expect(screen.getByText('Verify your email address')).toBeInTheDocument();
    expect(authApi.register).toHaveBeenCalledWith({ role: 'technician', name: 'Asha Rao', email: 'asha@test.local', password: 'Passw0rd!x' });
  });

  it('shows "email already exists" from the server', async () => {
    authApi.register.mockRejectedValue(apiError(409, 'An account with this email already exists', { code: 'EMAIL_TAKEN' }));
    renderApp('/register', anonymous());
    await screen.findByRole('heading', { name: 'Create your account' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
  });

  it('maps server field errors onto the fields', async () => {
    authApi.register.mockRejectedValue(apiError(422, 'Validation failed', { errors: [{ field: 'body.email', message: 'Email looks wrong' }] }));
    renderApp('/register', anonymous());
    await screen.findByRole('heading', { name: 'Create your account' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Email looks wrong')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'));
  });
});

describe('Forgot / reset / verify pages', () => {
  it('shows the same confirmation after requesting a reset link', async () => {
    authApi.forgotPassword.mockResolvedValue(null);
    renderApp('/forgot-password', anonymous());
    type('Email', 'asha@test.local');
    fireEvent.click(await screen.findByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/a reset link is on its way/i)).toBeInTheDocument();
    expect(authApi.forgotPassword).toHaveBeenCalledWith('asha@test.local');
  });

  it('reset page needs the emailed token', async () => {
    renderApp('/reset-password', anonymous());
    expect(await screen.findByText(/needs the link from your email/i)).toBeInTheDocument();
  });

  it('resets the password with the token from the link', async () => {
    authApi.resetPassword.mockResolvedValue(null);
    renderApp('/reset-password?token=' + 't'.repeat(43), anonymous());
    type('New password', 'Brand-new-9');
    type('Confirm new password', 'Brand-new-9');
    fireEvent.click(await screen.findByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Your password was updated.')).toBeInTheDocument();
    expect(authApi.resetPassword).toHaveBeenCalledWith('t'.repeat(43), 'Brand-new-9');
  });

  it('verifies the email once, even though effects may run twice', async () => {
    authApi.verifyEmail.mockResolvedValue(null);
    renderApp('/verify-email?token=' + 'v'.repeat(43), anonymous());
    expect(await screen.findByText(/email address is verified/i)).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  it('shows why verification failed', async () => {
    authApi.verifyEmail.mockRejectedValue(apiError(400, 'This verification link is invalid or has expired'));
    renderApp('/verify-email?token=' + 'v'.repeat(43), anonymous());
    expect(await screen.findByText('This verification link is invalid or has expired')).toBeInTheDocument();
  });
});
