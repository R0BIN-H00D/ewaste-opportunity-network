import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Markdown, { parseMarkdown } from '../lib/markdown';
import { LearnArticle, LearnIndex } from '../pages/public/Learn';
import { Route, Routes } from 'react-router-dom';
import { USER, renderApp, signedIn } from './helpers';
import { adminEducationApi } from '../services/adminApi';
import { educationApi } from '../services/educationApi';
import { setAccessToken } from '../services/api';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  categoryApi: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../services/educationApi', () => ({ educationApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('../services/adminApi', () => ({
  adminEducationApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const ADMIN = { ...USER, _id: 'a1', name: 'Chief Admin', role: 'admin' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 10, ...meta } });
const apiError = (message, status = 404, errors) => Object.assign(new Error(message), { response: { status, data: { message, errors } } });
const article = (o = {}) => ({
  _id: 'e1', slug: 'safe-disposal', title: 'Safe disposal', topic: 'safe-disposal', summary: 'How to get rid of it.', body: '- One\n- Two', featured: false,
  status: 'published', publishedAt: '2026-11-10T08:00:00.000Z', readMinutes: 2, author: { _id: 'a1', name: 'Chief Admin' },
  createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-11T08:00:00.000Z', ...o,
});

const BODY = 'Hand old phones to a reuse or recycling channel so the metals are recovered safely.';

beforeEach(() => { vi.clearAllMocks(); setAccessToken('t'); });

describe('the Markdown reader', () => {
  it('reads headings, lists, paragraphs and joins wrapped lines', () => {
    const blocks = parseMarkdown('# Big\n\nFirst line\nsecond line\n\n## Small\n\n- a\n- b\n\n1. one\n2. two\n\n### Tiny\n');
    expect(blocks).toEqual([
      { type: 'h2', text: 'Big' }, { type: 'p', text: 'First line second line' }, { type: 'h2', text: 'Small' },
      { type: 'ul', items: ['a', 'b'] }, { type: 'ol', items: ['one', 'two'] }, { type: 'h3', text: 'Tiny' },
    ]);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('- a\r\n- b')).toEqual([{ type: 'ul', items: ['a', 'b'] }]);
  });

  it('draws bold, italic, code and safe links', () => {
    render(<Markdown source={'Use **care**, *always*, and `reset`. See [our guide](/learn/safe-disposal) or [the law](https://example.org/law).'} />);
    expect(screen.getByText('care').tagName).toBe('STRONG');
    expect(screen.getByText('always').tagName).toBe('EM');
    expect(screen.getByText('reset').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'our guide' })).toHaveAttribute('href', '/learn/safe-disposal');
    const ext = screen.getByRole('link', { name: 'the law' });
    expect(ext).toHaveAttribute('target', '_blank');
    expect(ext.getAttribute('rel')).toContain('noopener');
  });

  it('shows markup as text and refuses unsafe link addresses', () => {
    const { container } = render(<Markdown source={'Read <script>alert(1)</script> and <img src=x onerror=alert(1)> then [click](javascript:alert(1)) or [data](data:text/html,x) or [other](//evil.example).'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.textContent).toContain('click');
  });
});

describe('the learning centre', () => {
  const index = () => render(<MemoryRouter><LearnIndex /></MemoryRouter>);
  const readingRoutes = (slug) => render(
    <MemoryRouter initialEntries={[`/learn/${slug}`]}>
      <Routes><Route path="/learn/:slug" element={<LearnArticle />} /><Route path="*" element={<p>Page not found</p>} /></Routes>
    </MemoryRouter>,
  );

  it('shows the starter guides at once, and keeps them if the server cannot be reached', async () => {
    educationApi.list.mockRejectedValue(new Error('offline'));
    index();
    expect(screen.getByText('The e-waste problem')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Read guide/ })).toHaveLength(7);
    await waitFor(() => expect(educationApi.list).toHaveBeenCalled());
    expect(screen.getByText('Safe disposal')).toBeInTheDocument();
  });

  it('replaces them with what the server has, with reading times', async () => {
    educationApi.list.mockResolvedValue(page([article({ slug: 'new-guide', title: 'A brand new guide', readMinutes: 3 })]));
    index();
    expect(await screen.findByText('A brand new guide')).toBeInTheDocument();
    expect(screen.getByText('3 min read')).toBeInTheDocument();
    expect(screen.queryByText('The e-waste problem')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read guide/ })).toHaveAttribute('href', '/learn/new-guide');
  });

  it('keeps the starter guides when the server has none yet', async () => {
    educationApi.list.mockResolvedValue(page([]));
    index();
    await waitFor(() => expect(educationApi.list).toHaveBeenCalled());
    expect(screen.getByText('The e-waste problem')).toBeInTheDocument();
  });

  it('reads an article from the server, with its next guide', async () => {
    educationApi.get.mockResolvedValue({ ...article({ body: '## Heading\n\nSome **bold** words.' }), next: { slug: 'reuse-and-donation', title: 'Reuse and donation' } });
    readingRoutes('safe-disposal');
    expect(await screen.findByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('2 min read')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Next: Reuse and donation/ })).toHaveAttribute('href', '/learn/reuse-and-donation');
  });

  it('shows the built-in text for a starter guide while loading, and when the server is out of reach', async () => {
    educationApi.get.mockRejectedValue(new Error('offline'));
    readingRoutes('safe-disposal');
    expect(screen.getByRole('heading', { name: 'Safe disposal' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What you can do' })).toBeInTheDocument();
    await waitFor(() => expect(educationApi.get).toHaveBeenCalledWith('safe-disposal', expect.anything()));
    expect(screen.getByRole('heading', { name: 'Safe disposal' })).toBeInTheDocument();
  });

  it('says "not found" when the server does, even for a guide that used to ship with the site', async () => {
    educationApi.get.mockRejectedValue(apiError('Article not found', 404));
    readingRoutes('safe-disposal');
    expect(await screen.findByText(/not found|404|couldn.t find/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What you can do' })).not.toBeInTheDocument();
  });

  it('says it could not load an unknown guide when the server is unreachable, and tries again on request', async () => {
    educationApi.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...article({ slug: 'new-guide', title: 'A newer guide', body: 'Some words here.' }), next: null });
    readingRoutes('new-guide');
    expect(await screen.findByText(/could not load this guide/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'A newer guide' })).toBeInTheDocument();
  });
  it('says "not found" for an unknown article', async () => {
    educationApi.get.mockRejectedValue(apiError('Article not found', 404));
    readingRoutes('no-such-guide');
    expect(await screen.findByText(/not found|404|couldn.t find/i)).toBeInTheDocument();
  });
});

describe('the administrators\' article list', () => {
  const open = (path = '/dashboard/admin/education') => renderApp(path, signedIn(ADMIN));

  it('is for administrators only', () => {
    renderApp('/dashboard/admin/education', signedIn(USER));
    expect(adminEducationApi.list).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Learning centre' })).not.toBeInTheDocument();
  });

  it('lists articles with their status, topic and what can be done', async () => {
    adminEducationApi.list.mockResolvedValue(page([article(), article({ _id: 'e2', slug: 'draft-one', title: 'A draft', status: 'draft', publishedAt: null, featured: true })]));
    open();
    expect(await screen.findByRole('heading', { name: 'Safe disposal' })).toBeInTheDocument();
    expect(screen.getByText('2 articles')).toBeInTheDocument();
    const first = screen.getByRole('heading', { name: 'Safe disposal' }).closest('article');
    expect(within(first).getByText('Published')).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'A draft' }).closest('article')).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText(/First/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish Safe disposal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish A draft' })).toBeInTheDocument();
    expect(screen.getByText(/\/learn\/draft-one/)).toBeInTheDocument();
  });

  it('filters by status and topic', async () => {
    adminEducationApi.list.mockResolvedValue(page([article()]));
    open();
    await screen.findByRole('heading', { name: 'Safe disposal' });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'draft' } });
    await waitFor(() => expect(adminEducationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'recycling' } });
    await waitFor(() => expect(adminEducationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft', topic: 'recycling' }), expect.anything()));
  });

  it('says so when there is nothing, and when the filter matches nothing', async () => {
    adminEducationApi.list.mockResolvedValue(page([]));
    open();
    expect(await screen.findByText('There are no articles')).toBeInTheDocument();
    open('/dashboard/admin/education?status=draft');
    expect(await screen.findByText('No article matches this')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    adminEducationApi.list.mockRejectedValueOnce(apiError('Server error', 500)).mockResolvedValue(page([article()]));
    open();
    fireEvent.click(await screen.findByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByRole('heading', { name: 'Safe disposal' })).toBeInTheDocument();
  });

  it('publishes a draft in one click', async () => {
    adminEducationApi.list.mockResolvedValue(page([article({ _id: 'e2', title: 'A draft', status: 'draft' })]));
    adminEducationApi.update.mockResolvedValue(article({ _id: 'e2', status: 'published' }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish A draft' }));
    await waitFor(() => expect(adminEducationApi.update).toHaveBeenCalledWith('e2', { status: 'published' }));
    await waitFor(() => expect(adminEducationApi.list).toHaveBeenCalledTimes(2));
  });

  it('asks before unpublishing or deleting, and does nothing if cancelled', async () => {
    adminEducationApi.list.mockResolvedValue(page([article()]));
    adminEducationApi.update.mockResolvedValue(article({ status: 'draft' }));
    adminEducationApi.remove.mockResolvedValue({ _id: 'e1' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish Safe disposal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/disappears from the learning centre/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(adminEducationApi.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Safe disposal' }));
    const second = await screen.findByRole('dialog');
    fireEvent.click(within(second).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(adminEducationApi.remove).toHaveBeenCalledWith('e1'));
    expect(adminEducationApi.update).not.toHaveBeenCalled();
  });

  it('shows the server\'s reason when an action fails', async () => {
    adminEducationApi.list.mockResolvedValue(page([article({ status: 'draft' })]));
    adminEducationApi.update.mockRejectedValue(apiError('Article not found', 404));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish Safe disposal' }));
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });
});

describe('writing an article', () => {
  const open = async () => {
    adminEducationApi.list.mockResolvedValue(page([]));
    renderApp('/dashboard/admin/education', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: /New article/ }));
    return screen.findByRole('dialog');
  };
  it('checks the form before sending anything', async () => {
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Use at least 3 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a topic.')).toBeInTheDocument();
    expect(within(dialog).getByText('Write at least a few sentences.')).toBeInTheDocument();
    expect(adminEducationApi.create).not.toHaveBeenCalled();
  });

  it('saves a draft by default and closes', async () => {
    adminEducationApi.create.mockResolvedValue(article({ status: 'draft' }));
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: '  Why repair beats replace ' } });
    fireEvent.change(within(dialog).getByLabelText('Topic'), { target: { value: 'repair-benefits' } });
    fireEvent.change(within(dialog).getByLabelText('Article text'), { target: { value: BODY } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminEducationApi.create).toHaveBeenCalledWith({ title: 'Why repair beats replace', topic: 'repair-benefits', summary: '', body: BODY, featured: false, status: 'draft' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('previews what readers will see, with markup shown as text', async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Article text'), { target: { value: '## Heading\n\n**bold** and <b>raw</b>' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const preview = within(dialog).getByLabelText('Preview');
    expect(within(preview).getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(within(preview).getByText('bold').tagName).toBe('STRONG');
    expect(preview.textContent).toContain('<b>raw</b>');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to writing' }));
    expect(within(dialog).getByLabelText('Article text')).toHaveValue('## Heading\n\n**bold** and <b>raw</b>');
  });

  it('shows the server\'s field problems and keeps what was typed', async () => {
    adminEducationApi.create.mockRejectedValue(apiError('Validation failed', 422, [{ field: 'body', message: 'Write at least a few sentences' }]));
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'A fine title' } });
    fireEvent.change(within(dialog).getByLabelText('Topic'), { target: { value: 'reuse' } });
    fireEvent.change(within(dialog).getByLabelText('Article text'), { target: { value: BODY } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Write at least a few sentences/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toHaveValue('A fine title');
  });

  it('opens an existing article for editing and sends the whole form', async () => {
    adminEducationApi.list.mockResolvedValue(page([article({ featured: true, body: BODY })]));
    adminEducationApi.update.mockResolvedValue(article());
    renderApp('/dashboard/admin/education', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Safe disposal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Safe disposal');
    expect(within(dialog).getByRole('checkbox', { name: /Show first/ })).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText('Status'), { target: { value: 'draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminEducationApi.update).toHaveBeenCalledWith('e1', expect.objectContaining({ title: 'Safe disposal', status: 'draft', featured: true })));
  });
});