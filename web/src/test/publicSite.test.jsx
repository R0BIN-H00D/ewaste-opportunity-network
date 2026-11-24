import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { marketApi } from '../services/marketplaceApi';
import { impactApi } from '../services/impactApi';
import Accordion from '../components/ui/Accordion';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/educationApi', () => ({
  educationApi: {
    list: () => Promise.reject(new Error('offline')),
    get: (slug) => Promise.reject(slug === 'does-not-exist' ? Object.assign(new Error('Article not found'), { response: { status: 404 } }) : new Error('offline')),
  },
}));

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/marketplaceApi', () => ({ marketApi: { list: vi.fn() }, orderApi: {} }));
// The impact figures have their own tests (impact.test.jsx); here the landing and impact pages only need to render.
vi.mock('../services/impactApi', () => ({ impactApi: { platform: vi.fn(), rules: vi.fn(), monthly: vi.fn(), yearly: vi.fn(), byCategory: vi.fn(), mine: vi.fn(), score: vi.fn() } }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const EMPTY_PAGE = { items: [], meta: { total: 0, page: 1, pages: 1, limit: 12 } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([]);
  deviceApi.list.mockResolvedValue(EMPTY_PAGE);
  marketApi.list.mockResolvedValue(EMPTY_PAGE);
  impactApi.platform.mockRejectedValue(new Error('not needed here'));
  impactApi.rules.mockRejectedValue(new Error('not needed here'));
  impactApi.monthly.mockRejectedValue(new Error('not needed here'));
  impactApi.yearly.mockRejectedValue(new Error('not needed here'));
  impactApi.byCategory.mockRejectedValue(new Error('not needed here'));
});

describe('public navigation', () => {
  const primary = () => within(screen.getByRole('navigation', { name: 'Primary' }));

  it('shows the main links and moves between pages', async () => {
    renderApp('/', anonymous());
    expect(await screen.findByRole('heading', { level: 1, name: /Give Your Electronics/ })).toBeInTheDocument();
    for (const name of ['Home', 'How It Works', 'Browse Devices', 'Find Services', 'Marketplace']) {
      expect(primary().getAllByRole('link', { name }).length).toBeGreaterThan(0);
    }
    expect(primary().queryByRole('link', { name: 'Environmental Impact' })).not.toBeInTheDocument(); // not in the top navigation
    fireEvent.click(primary().getAllByRole('link', { name: 'Browse Devices' })[0]);
    expect(await screen.findByRole('heading', { name: 'Browse devices' })).toBeInTheDocument();
  });

  it('opens and closes the mobile menu', async () => {
    renderApp('/', anonymous());
    fireEvent.click(await screen.findByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('offers a skip link and a dashboard link once signed in', async () => {
    renderApp('/how-it-works', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(primary().getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
  });
});

describe('static and content pages', () => {
  it.each([
    ['/how-it-works', 'How it works'],
    ['/about', 'About us'],
    ['/privacy', 'Privacy policy'],
    ['/terms', 'Terms and conditions'],
    ['/learn', 'Learning centre'],
    ['/learn/safe-disposal', 'Safe disposal'],
    ['/services', 'Find services'],
    ['/marketplace', 'Marketplace'],
    ['/impact', 'Environmental impact'],
    ['/contact', 'Contact and support'],
  ])('renders %s', async (path, title) => {
    renderApp(path, anonymous());
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown articles and routes', async () => {
    renderApp('/learn/does-not-exist', anonymous());
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('links every learning-centre card to its article', async () => {
    renderApp('/learn', anonymous());
    await screen.findByRole('heading', { level: 1, name: 'Learning centre' });
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/learn/'));
    expect(links.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Contact form', () => {
  const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const fill = () => {
    type('Your name', 'Asha Rao');
    type('Email', 'asha@test.local');
    type('Subject', 'Pickup question');
    type('Message', 'Can you collect a laptop from Pune?');
  };

  it('shows an error under every empty field and sends nothing', async () => {
    const post = vi.spyOn(api, 'post');
    renderApp('/contact', anonymous());
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter a subject (at least 3 characters)')).toBeInTheDocument();
    expect(screen.getByText('Write at least 10 characters')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the message, confirms it and clears the form', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true } });
    renderApp('/contact', anonymous());
    await screen.findByRole('heading', { level: 1, name: 'Contact and support' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/Your message was sent/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith('/contact', { name: 'Asha Rao', email: 'asha@test.local', subject: 'Pickup question', message: 'Can you collect a laptop from Pune?' });
    expect(screen.getByLabelText('Subject')).toHaveValue('');
  });

  it('shows server-side field errors next to the field', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 422, data: { message: 'Validation failed', errors: [{ field: 'body.email', message: 'That email address is not valid' }] } } });
    renderApp('/contact', anonymous());
    await screen.findByRole('heading', { level: 1, name: 'Contact and support' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('That email address is not valid')).toBeInTheDocument();
  });

  it('explains rate limiting in plain words and keeps what was typed', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 429, data: { message: 'Too many requests' } } });
    renderApp('/contact', anonymous());
    await screen.findByRole('heading', { level: 1, name: 'Contact and support' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/several messages recently/)).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Pickup question');
  });

  it('reports a network failure', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ request: {} });
    renderApp('/contact', anonymous());
    await screen.findByRole('heading', { level: 1, name: 'Contact and support' });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument();
  });
});

describe('Accordion', () => {
  const items = [{ q: 'First?', a: 'Answer one' }, { q: 'Second?', a: 'Answer two' }];

  it('opens one panel at a time and reflects it in aria-expanded', () => {
    render(<Accordion items={items} />);
    const [one, two] = screen.getAllByRole('button');
    expect(one).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(one);
    expect(one).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Answer one')).toBeVisible();
    fireEvent.click(two);
    expect(one).toHaveAttribute('aria-expanded', 'false');
    expect(two).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Answer one')).not.toBeVisible();
  });

  it('closes the open panel when it is clicked again', () => {
    render(<Accordion items={items} />);
    const [one] = screen.getAllByRole('button');
    fireEvent.click(one);
    fireEvent.click(one);
    expect(one).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Modal and ConfirmDialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open it</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Sample dialog" footer={<button type="button">Save</button>}>Body text</Modal>
      </>
    );
  }

  it('opens as a labelled dialog and moves focus into it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = screen.getByRole('dialog', { name: 'Sample dialog' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement);
  });

  it('closes on Escape and returns focus to the opener', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open it' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes with the close button and when the backdrop is clicked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside the dialog', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('ConfirmDialog calls confirm and cancel, and disables buttons while busy', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog open title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel}>Sure?</ConfirmDialog>);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<ConfirmDialog open busy title="Delete?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel}>Sure?</ConfirmDialog>);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});

describe('landing page data', () => {
  it('still renders when the listings request fails', async () => {
    deviceApi.list.mockRejectedValue({ request: {} });
    renderApp('/', anonymous());
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Give Your Electronics/ })).toBeInTheDocument());
  });
});
