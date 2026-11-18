import { fireEvent, screen, waitFor } from '@testing-library/react';
import { authApi, verificationApi } from '../services/authApi';
import { geoApi } from '../services/geoApi';
import { TECH, USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({
  authApi: { me: vi.fn(), resendVerification: vi.fn() },
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

  it('does not show verification controls once approved', async () => {
    verificationApi.status.mockResolvedValue(statusData({ status: 'approved' }));
    renderApp('/dashboard/settings', signedIn({ ...TECH_ACTIVE, status: 'active' }, { verification: { status: 'approved' } }));
    expect(await screen.findByRole('heading', { name: 'Verification' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
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
