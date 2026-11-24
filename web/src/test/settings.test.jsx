import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { authApi, verificationApi } from '../services/authApi';
import { geoApi } from '../services/geoApi';
import { TECH, USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({
  authApi: { me: vi.fn(), resendVerification: vi.fn(), verifyEmailCode: vi.fn() },
  userApi: {},
  verificationApi: { status: vi.fn(), submit: vi.fn(), remove: vi.fn() },
}));
vi.mock('../services/geoApi', () => ({ geoApi: { reverse: vi.fn(), search: vi.fn() } }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const TECH_ACTIVE = { ...TECH, status: 'pending_verification' };
const statusData = (over = {}) => ({ status: 'not_submitted', allowedDocTypes: ['id_proof', 'qualification', 'other'], documents: [], ...over });

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('Settings page', () => {
  it('shows account sections to everyone, but provider sections only to providers', async () => {
    renderApp('/dashboard/settings', signedIn());
    expect(await screen.findByRole('heading', { name: 'Profile photo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Password and sessions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Technician details' })).not.toBeInTheDocument();
  });

  it('does not show the profile and address box to an administrator', async () => {
    renderApp('/dashboard/settings', signedIn({ ...USER, role: 'admin' }));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Profile and address' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use my current location' })).not.toBeInTheDocument();
  });

  it('shows role details and verification for a technician', async () => {
    verificationApi.status.mockResolvedValue(statusData());
    renderApp('/dashboard/settings', signedIn(TECH_ACTIVE, { roleProfile: { headline: 'Phone repair' }, verification: { status: 'not_submitted' } }));
    expect(await screen.findByRole('heading', { name: 'Technician details' })).toBeInTheDocument();
    expect(screen.getByLabelText('Headline')).toHaveValue('Phone repair');
    expect(await screen.findByRole('heading', { name: 'Verification' })).toBeInTheDocument();
  });

  it('uploads documents: needs a file first, then submits the chosen type and files', async () => {
    verificationApi.status.mockResolvedValue(statusData());
    verificationApi.submit.mockResolvedValue({ verificationStatus: 'pending', documents: [] });
    authApi.me.mockResolvedValue({ user: TECH_ACTIVE, profile: {}, roleProfile: {}, verification: { status: 'pending' } });
    renderApp('/dashboard/settings', signedIn(TECH_ACTIVE, { verification: { status: 'not_submitted' } }));

    fireEvent.click(await screen.findByRole('button', { name: 'Verify my account' }));
    const submit = await screen.findByRole('button', { name: 'Submit for review' });
    expect(submit).toBeDisabled();

    const file = new File(['%PDF-1.4 test'], 'id-card.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Choose document files'), { target: { files: [file] } });
    expect(await screen.findByText('id-card.pdf')).toBeInTheDocument();
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(verificationApi.submit).toHaveBeenCalledWith('id_proof', [file]));
    expect(await screen.findByText(/An administrator will review them/)).toBeInTheDocument();
  });

  it('rejects unsupported files before uploading', async () => {
    verificationApi.status.mockResolvedValue(statusData());
    renderApp('/dashboard/settings', signedIn(TECH_ACTIVE));
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my account' }));
    await screen.findByRole('button', { name: 'Submit for review' });
    const bad = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Choose document files'), { target: { files: [bad] } });
    expect(await screen.findByText(/must be a JPEG, PNG, WebP or PDF file/)).toBeInTheDocument();
    expect(verificationApi.submit).not.toHaveBeenCalled();
  });

  it('lists submitted documents with their review status', async () => {
    verificationApi.status.mockResolvedValue(
      statusData({
        status: 'rejected',
        reason: 'Blurry ID',
        documents: [{ _id: 'd1', docType: 'id_proof', status: 'rejected', file: { originalName: 'id.png' } }],
      }),
    );
    renderApp('/dashboard/settings', signedIn(TECH_ACTIVE));
    expect(await screen.findByText(/Reason: Blurry ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete id.png' })).toBeInTheDocument();
  });

  it('asks an unverified technician to verify, right under the header, with a button that opens the upload form', async () => {
    verificationApi.status.mockResolvedValue(statusData());
    renderApp('/dashboard/settings', signedIn(TECH_ACTIVE, { verification: { status: 'not_submitted' } }));
    const box = await screen.findByRole('region', { name: 'Verification' });
    expect(within(box).getByText(/Verified providers can take requests/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument(); // folded away until asked for
    fireEvent.click(within(box).getByRole('button', { name: 'Verify my account' }));
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
  });

  it('shows no verification box once approved, and a Verified badge in the header instead', async () => {
    verificationApi.status.mockResolvedValue(statusData({ status: 'approved' }));
    renderApp('/dashboard/settings', signedIn({ ...TECH_ACTIVE, status: 'active' }, { verification: { status: 'approved' } }));
    expect(within(await screen.findByRole('region', { name: 'Profile photo' })).getByText('Verified')).toBeInTheDocument();
    await waitFor(() => expect(verificationApi.status).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify my account' })).not.toBeInTheDocument();
  });
});

describe('Delete account', () => {
  it('asks for the password before anything happens', async () => {
    renderApp('/dashboard/settings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: /Delete my account/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password to confirm'); // (the label has the same words)
  });
});

describe('Use my current location', () => {
  const allowLocation = (coords = { latitude: 12.97389, longitude: 77.64077 }) => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords }) },
    });
  };

  it('fills in the area, city, state and pincode from where the person is', async () => {
    allowLocation();
    geoApi.reverse.mockResolvedValue({ label: 'x', lat: 12.97389, lng: 77.64077, area: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560 038' });
    renderApp('/dashboard/settings', signedIn());
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current location' }));
    await waitFor(() => expect(geoApi.reverse).toHaveBeenCalledWith(12.97389, 77.64077));
    await waitFor(() => expect(screen.getByLabelText('Area / locality')).toHaveValue('Indiranagar'));
    expect(screen.getByLabelText('City')).toHaveValue('Bengaluru');
    expect(screen.getByLabelText('State')).toHaveValue('Karnataka');
    expect(screen.getByLabelText('Pincode')).toHaveValue('560038');
    expect(await screen.findByText(/Area, city, state and pincode are filled in/)).toBeInTheDocument();
    expect(screen.getByText(/Saved point: 12.97389, 77.64077/)).toBeInTheDocument();
  });

  it('keeps the point and asks the person to type the address when the lookup fails', async () => {
    allowLocation();
    geoApi.reverse.mockRejectedValue({ response: { status: 503, data: { message: 'down' } } });
    renderApp('/dashboard/settings', signedIn());
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/could not look up the address/)).toBeInTheDocument();
    expect(screen.getByText(/Saved point/)).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toHaveValue('');
  });

  it('says so when location is blocked', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
    });
    renderApp('/dashboard/settings', signedIn());
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/Location is blocked/)).toBeInTheDocument();
    expect(geoApi.reverse).not.toHaveBeenCalled();
  });
});

describe('verifying the email on the profile page', () => {
  const unverified = () => signedIn({ ...USER, emailVerified: false });

  it('shows a verified person that their email is verified, with no button', async () => {
    renderApp('/dashboard/settings', signedIn());
    expect(await screen.findByRole('heading', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByText(/is verified./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify my email' })).not.toBeInTheDocument();
  });

  it('sends nothing until the button is pressed, then asks for the code', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'smtp' });
    renderApp('/dashboard/settings', unverified());
    expect(await screen.findByText(/is not verified yet/)).toBeInTheDocument();
    expect(authApi.resendVerification).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Verify my email' }));
    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument();
    expect(authApi.resendVerification).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/We sent a 6-digit code to asha@test.local/)).toBeInTheDocument();
  });

  it('confirms the email with the code and shows it as verified', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'smtp' });
    authApi.verifyEmailCode.mockResolvedValue(null);
    authApi.me.mockResolvedValue({ user: { ...USER, emailVerified: true }, profile: {}, roleProfile: null });
    renderApp('/dashboard/settings', unverified());
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my email' }));
    const input = await screen.findByLabelText('Verification code');
    fireEvent.change(input, { target: { value: '12ab' } }); // letters are dropped as they are typed
    expect(input).toHaveValue('12');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter the 6-digit code from your email.')).toBeInTheDocument();
    expect(authApi.verifyEmailCode).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(authApi.verifyEmailCode).toHaveBeenCalledWith('482913'));
    expect(await screen.findByText(/is verified./)).toBeInTheDocument();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
  });

  it('says when the code is wrong and keeps the box', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'smtp' });
    authApi.verifyEmailCode.mockRejectedValue({ response: { status: 400, data: { message: 'That code is not right. 4 tries left.' } } });
    renderApp('/dashboard/settings', unverified());
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my email' }));
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('That code is not right. 4 tries left.')).toBeInTheDocument();
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  });

  it('can send a new code', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'smtp' });
    renderApp('/dashboard/settings', unverified());
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(authApi.resendVerification).toHaveBeenCalledTimes(2));
  });

  it('says so, and offers no code box, when the server has no email service', async () => {
    authApi.resendVerification.mockResolvedValue({ delivery: 'console' });
    renderApp('/dashboard/settings', unverified());
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my email' }));
    expect(await screen.findByText(/no email service set up/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify my email' })).toBeInTheDocument(); // the person can try again later
  });

  it('shows the server message when the email could not be sent', async () => {
    authApi.resendVerification.mockRejectedValue({ response: { status: 502, data: { message: 'We could not send the email. Check the address is right, or try again in a minute.' } } });
    renderApp('/dashboard/settings', unverified());
    fireEvent.click(await screen.findByRole('button', { name: 'Verify my email' }));
    expect(await screen.findByText(/We could not send the email/)).toBeInTheDocument();
  });
});
