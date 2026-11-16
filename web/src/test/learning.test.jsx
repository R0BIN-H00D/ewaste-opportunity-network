import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { applicationApi, experienceApi, opportunityApi } from '../services/learningApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { applicationLabel, applicationSteps, endOfDayIso, formatHours, parseSkills, toDateInput } from '../lib/learning';
import { TECH, USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/learningApi', () => ({
  opportunityApi: { list: vi.fn(), mine: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), applicants: vi.fn() },
  applicationApi: { apply: vi.fn(), list: vi.fn(), get: vi.fn(), decide: vi.fn(), start: vi.fn(), complete: vi.fn(), withdraw: vi.fn() },
  experienceApi: { get: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const STUDENT = { ...USER, _id: 's1', name: 'Ravi Kumar', role: 'student', status: 'active' };
const TECHNICIAN = { ...TECH, status: 'active' };
const LAPTOP = { _id: 'k1', name: 'Laptop', slug: 'laptops' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });

const opp = (over = {}) => ({
  _id: 'o1', title: 'Diagnose a laptop that will not power on', description: 'Check the charger, battery and board with a multimeter.', deviceType: LAPTOP,
  requiredSkills: ['multimeter', 'troubleshooting'], difficulty: 'beginner', locationArea: 'Indiranagar, Bengaluru', deadline: '2027-01-20T18:29:59.000Z',
  seats: 2, seatsTaken: 0, seatsLeft: 2, expectedHours: 6, status: 'open', supervised: true, hazardousExcluded: true,
  supervisor: { _id: 'u2', name: 'Demo Technician', headline: '', city: 'Bengaluru', ratingAvg: 4.5, ratingCount: 2 }, viewerRole: null, ...over,
});
const application = (over = {}) => ({
  _id: 'a1', status: 'applied', message: 'I enjoy fixing laptops.', supervisorFeedback: '', hours: 0, createdAt: '2026-11-15T07:00:00.000Z', viewerRole: 'student', actions: ['withdraw'],
  opportunity: { _id: 'o1', title: 'Diagnose a laptop that will not power on', difficulty: 'beginner', deadline: '2027-01-20T18:29:59.000Z', locationArea: 'Indiranagar, Bengaluru', status: 'open', requiredSkills: ['multimeter'], deviceType: LAPTOP, supervisor: { _id: 'u2', name: 'Demo Technician' } },
  student: { _id: 's1', name: 'Ravi Kumar', college: 'NIT Trichy', course: 'ECE', yearOfStudy: 2, hoursCompleted: 3, skills: ['soldering'] },
  certificate: null, history: [{ status: 'applied', at: '2026-11-15T07:00:00.000Z' }], ...over,
});
const asSupervisor = (over = {}) => application({ viewerRole: 'supervisor', actions: ['accept', 'reject'], ...over });

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  categoryApi.list.mockResolvedValue([{ _id: 'k1', slug: 'laptops', name: 'Laptops' }, { _id: 'k3', slug: 'monitor', name: 'Monitor', hazardous: true }]);
  opportunityApi.list.mockResolvedValue(page([opp()]));
  opportunityApi.mine.mockResolvedValue(page([]));
  opportunityApi.applicants.mockResolvedValue(page([]));
  applicationApi.list.mockResolvedValue(page([]));
  experienceApi.get.mockResolvedValue({ summary: { completedCount: 0, totalHours: 0, skills: [] }, items: [] });
});

describe('learning helpers', () => {
  it('labels statuses and hours', () => {
    expect(applicationLabel('in_progress')).toBe('In progress');
    expect(applicationLabel('rejected')).toBe('Not accepted');
    expect(formatHours(1)).toBe('1 hour');
    expect(formatHours(2.5)).toBe('2.5 hours');
    expect(formatHours(undefined)).toBe('0 hours');
  });
  it('cleans a skills list', () => {
    expect(parseSkills(' Multimeter, soldering ,multimeter,,')).toEqual(['multimeter', 'soldering']);
    expect(parseSkills('')).toEqual([]);
  });
  it('closes applications at the end of the chosen day', () => {
    expect(toDateInput(endOfDayIso('2027-03-05'))).toBe('2027-03-05');
    expect(toDateInput('')).toBe('');
  });
  it('tracks progress and shows how far a stopped application got', () => {
    const state = (a) => Object.fromEntries(applicationSteps(a).map((s) => [s.key, s.state]));
    expect(state({ status: 'in_progress' })).toEqual({ applied: 'done', accepted: 'done', in_progress: 'current', completed: 'todo' });
    expect(Object.values(state({ status: 'completed' })).every((s) => s === 'done')).toBe(true);
    expect(state({ status: 'withdrawn', history: [{ status: 'applied' }, { status: 'accepted' }, { status: 'withdrawn' }] })).toMatchObject({ accepted: 'done', in_progress: 'todo' });
    expect(state({ status: 'rejected', history: [{ status: 'applied' }, { status: 'rejected' }] })).toMatchObject({ applied: 'done', accepted: 'todo' });
  });
});

describe('opportunity directory', () => {
  it('lists open tasks to anyone, with difficulty, supervisor and the supervision note', async () => {
    renderApp('/opportunities', anonymous());
    expect(await screen.findByRole('link', { name: 'Diagnose a laptop that will not power on' })).toHaveAttribute('href', '/opportunities/o1');
    const card = within(screen.getByRole('article'));
    expect(card.getByText('Beginner')).toBeInTheDocument();
    expect(card.getByText('multimeter')).toBeInTheDocument();
    expect(card.getByText('Apply by', { exact: false })).toBeInTheDocument();
    expect(card.getByText('2 of 2 places left')).toBeInTheDocument();
    expect(card.getByText('Supervised · no hazardous handling')).toBeInTheDocument();
    expect(card.getByText('Supervised by Demo Technician', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('1 opportunity found')).toBeInTheDocument();
  });

  it('never offers hazardous device types as a filter', async () => {
    renderApp('/opportunities', anonymous());
    await screen.findByRole('article');
    const select = await screen.findByLabelText('Device type');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Laptops' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'Monitor' })).not.toBeInTheDocument();
  });

  it('filters by difficulty and skill and can clear the filters', async () => {
    renderApp('/opportunities', anonymous());
    await screen.findByRole('article');
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'advanced' } });
    await waitFor(() => expect(opportunityApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: 'advanced' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'soldering' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(opportunityApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: 'advanced', skill: 'soldering' }), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(opportunityApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: '', skill: '' }), expect.anything()));
  });

  it('explains an empty feed', async () => {
    opportunityApi.list.mockResolvedValue(page([]));
    renderApp('/opportunities', anonymous());
    expect(await screen.findByText('No open opportunities right now')).toBeInTheDocument();
  });

  it('explains an empty search differently', async () => {
    opportunityApi.list.mockResolvedValue(page([]));
    renderApp('/opportunities?skill=nothing', anonymous());
    expect(await screen.findByText('No opportunities match your search')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    opportunityApi.list.mockRejectedValueOnce(apiError('Server error', 'SERVER_ERROR', 500));
    renderApp('/opportunities', anonymous());
    expect(await screen.findByText('Could not load the opportunities')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});

describe('opportunity detail and applying', () => {
  it('asks a visitor to log in', async () => {
    opportunityApi.get.mockResolvedValue(opp());
    renderApp('/opportunities/o1', anonymous());
    expect(await screen.findByRole('heading', { name: 'Diagnose a laptop that will not power on' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in to apply' })).toHaveAttribute('href', '/login');
    expect(screen.getByText('Supervision and safety')).toBeInTheDocument();
    expect(screen.getByText('6 hours')).toBeInTheDocument();
  });

  it('lets a verified student apply with a message and opens the application', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student', myApplication: null, applyBlock: null }));
    applicationApi.apply.mockResolvedValue({ _id: 'a1', status: 'applied' });
    applicationApi.get.mockResolvedValue(application());
    const { router } = renderApp('/opportunities/o1', signedIn(STUDENT));
    const form = await screen.findByRole('form', { name: 'Apply for this task' });
    fireEvent.change(within(form).getByLabelText('Message to the supervisor (optional)'), { target: { value: 'I enjoy fixing laptops.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(applicationApi.apply).toHaveBeenCalledWith('o1', 'I enjoy fixing laptops.'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard/applications/a1'));
    expect(await screen.findByText('Your application was sent. The supervising technician will respond.')).toBeInTheDocument();
  });

  it('shows the server’s reason when applying fails', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student', myApplication: null, applyBlock: null }));
    applicationApi.apply.mockRejectedValue(apiError('All places on this opportunity are taken.', 'FILLED'));
    renderApp('/opportunities/o1', signedIn(STUDENT));
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('All places on this opportunity are taken.')).toBeInTheDocument();
  });

  it('explains why an unverified student cannot apply', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student', myApplication: null, applyBlock: 'not_verified' }));
    renderApp('/opportunities/o1', signedIn(STUDENT));
    expect(await screen.findByText(/approved by an administrator before you can apply/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('points a student who has applied to their application', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student', myApplication: { _id: 'a1', status: 'accepted' }, applyBlock: 'already_applied' }));
    renderApp('/opportunities/o1', signedIn(STUDENT));
    expect(await screen.findByRole('link', { name: 'View your application' })).toHaveAttribute('href', '/dashboard/applications/a1');
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('shows the supervisor a link to manage', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'supervisor' }));
    renderApp('/opportunities/o1', signedIn(TECHNICIAN));
    expect(await screen.findByRole('link', { name: 'Manage this task' })).toHaveAttribute('href', '/dashboard/learning-tasks/o1');
  });

  it('tells other roles that only verified students can apply', async () => {
    opportunityApi.get.mockResolvedValue(opp());
    renderApp('/opportunities/o1', signedIn(USER));
    expect(await screen.findByText('For verified students')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
  });

  it('says so when the opportunity does not exist', async () => {
    opportunityApi.get.mockRejectedValue(apiError('Opportunity not found', 'NOT_FOUND', 404));
    renderApp('/opportunities/missing', anonymous());
    expect(await screen.findByText('Opportunity not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the opportunities' })).toBeInTheDocument();
  });
});

describe('student learning home', () => {
  it('shows experience, the portfolio and certificate state', async () => {
    const done = application({ status: 'completed', hours: 4, actions: [], certificate: null });
    experienceApi.get.mockResolvedValue({ summary: { completedCount: 1, totalHours: 4, skills: ['soldering'] }, items: [done, { ...done, _id: 'a2', certificate: 'CERT-2026-ABC123' }] });
    applicationApi.list.mockResolvedValue(page([done]));
    renderApp('/dashboard/learning', signedIn(STUDENT));
    expect(await screen.findByText('Tasks completed')).toBeInTheDocument();
    expect(screen.getByText('Supervised hours')).toBeInTheDocument();
    expect(screen.getByText('soldering')).toBeInTheDocument();
    expect(screen.getByText('Certificate pending approval')).toBeInTheDocument();
    expect(screen.getByText('Certificate CERT-2026-ABC123')).toBeInTheDocument();
    expect((await screen.findAllByRole('link', { name: 'Diagnose a laptop that will not power on' })).length).toBeGreaterThan(0);
  });

  it('filters the applications by status', async () => {
    renderApp('/dashboard/learning', signedIn(STUDENT));
    expect(await screen.findByText('You have not applied yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'accepted' } });
    await waitFor(() => expect(applicationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'accepted' }), expect.anything()));
    expect(await screen.findByText('No applications with this status')).toBeInTheDocument();
  });

  it('is for students only', async () => {
    renderApp('/dashboard/learning', signedIn(USER));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
  });
});

describe('application detail', () => {
  it('shows a student their progress and lets them withdraw', async () => {
    applicationApi.get.mockResolvedValueOnce(application()).mockResolvedValue(application({ status: 'withdrawn', actions: [], history: [{ status: 'applied', at: '2026-11-15T07:00:00.000Z' }, { status: 'withdrawn', at: '2026-11-15T08:00:00.000Z' }] }));
    applicationApi.withdraw.mockResolvedValue({ _id: 'a1', status: 'withdrawn' });
    renderApp('/dashboard/applications/a1', signedIn(STUDENT));
    expect(await screen.findByRole('heading', { name: 'Diagnose a laptop that will not power on' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByText('I enjoy fixing laptops.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Withdraw your application?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(applicationApi.withdraw).toHaveBeenCalledWith('a1', undefined));
    expect(await screen.findByText('Your application was withdrawn.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Application actions' })).not.toBeInTheDocument());
  });

  it('shows the supervisor the student’s college and hours, never contact details, and accepts', async () => {
    applicationApi.get.mockResolvedValue(asSupervisor());
    applicationApi.decide.mockResolvedValue({ _id: 'a1', status: 'accepted' });
    renderApp('/dashboard/applications/a1', signedIn(TECHNICIAN));
    expect(await screen.findByRole('heading', { name: 'Ravi Kumar’s application' })).toBeInTheDocument();
    expect(screen.getByText('NIT Trichy')).toBeInTheDocument();
    expect(screen.getByText('3 hours')).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note to the student (optional)'), { target: { value: 'Bring a multimeter.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept student' }));
    await waitFor(() => expect(applicationApi.decide).toHaveBeenCalledWith('a1', 'accepted', 'Bring a multimeter.'));
    expect(await screen.findByText('The student has been accepted.')).toBeInTheDocument();
  });

  it('declines with an optional reason', async () => {
    applicationApi.get.mockResolvedValue(asSupervisor());
    applicationApi.decide.mockResolvedValue({ _id: 'a1', status: 'rejected' });
    renderApp('/dashboard/applications/a1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Decline application' }));
    await waitFor(() => expect(applicationApi.decide).toHaveBeenCalledWith('a1', 'rejected', undefined));
  });

  it('starts a task once it is accepted', async () => {
    applicationApi.get.mockResolvedValue(asSupervisor({ status: 'accepted', actions: ['start', 'reject'] }));
    applicationApi.start.mockResolvedValue({ _id: 'a1', status: 'in_progress' });
    renderApp('/dashboard/applications/a1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Start task' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Start task' }));
    await waitFor(() => expect(applicationApi.start).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText('The task has started.')).toBeInTheDocument();
  });

  it('needs the hours before completing, then records them with feedback', async () => {
    applicationApi.get.mockResolvedValue(asSupervisor({ status: 'in_progress', actions: ['complete'] }));
    applicationApi.complete.mockResolvedValue({ _id: 'a1', status: 'completed' });
    renderApp('/dashboard/applications/a1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete task' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete task' }));
    expect(await within(dialog).findByText('Enter the hours worked, from 0.5 to 200.')).toBeInTheDocument();
    expect(applicationApi.complete).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Hours worked'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText('Feedback for the student (optional)'), { target: { value: 'Great diagnosis.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete task' }));
    await waitFor(() => expect(applicationApi.complete).toHaveBeenCalledWith('a1', { hours: 4, feedback: 'Great diagnosis.' }));
    expect(await screen.findByText('The task is complete and the hours are recorded.')).toBeInTheDocument();
  });

  it('shows the server’s reason inside the dialog when an action is refused', async () => {
    applicationApi.get.mockResolvedValue(asSupervisor());
    applicationApi.decide.mockRejectedValue(apiError('All places are taken.', 'SEATS_FULL'));
    renderApp('/dashboard/applications/a1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept student' }));
    expect(await within(dialog).findByText('All places are taken.')).toBeInTheDocument();
  });

  it('shows a completed task with its hours and the certificate', async () => {
    applicationApi.get.mockResolvedValue(application({ status: 'completed', hours: 4, actions: [], certificate: 'CERT-2026-ABC123', supervisorFeedback: 'Great diagnosis.', completedAt: '2026-11-16T07:00:00.000Z' }));
    renderApp('/dashboard/applications/a1', signedIn(STUDENT));
    expect(await screen.findByText('CERT-2026-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Great diagnosis.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Application actions' })).not.toBeInTheDocument();
  });

  it('tells a stranger it was not found', async () => {
    applicationApi.get.mockRejectedValue(apiError('Application not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/applications/zzz', signedIn(STUDENT));
    expect(await screen.findByText('Application not found')).toBeInTheDocument();
  });
});

describe('technician task list', () => {
  it('lists my tasks with application counts', async () => {
    opportunityApi.mine.mockResolvedValue(page([opp({ viewerRole: 'supervisor', counts: { applied: 2, accepted: 1 } })]));
    renderApp('/dashboard/learning-tasks', signedIn(TECHNICIAN));
    expect(await screen.findByRole('link', { name: 'Diagnose a laptop that will not power on' })).toHaveAttribute('href', '/dashboard/learning-tasks/o1');
    expect(screen.getByText('2 applied · 1 accepted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Post a task' })).toHaveAttribute('href', '/dashboard/learning-tasks/new');
  });

  it('shows an empty state and filters by status', async () => {
    renderApp('/dashboard/learning-tasks', signedIn(TECHNICIAN));
    expect(await screen.findByText('You have not posted a task yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'closed' } });
    await waitFor(() => expect(opportunityApi.mine).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'closed' }), expect.anything()));
  });

  it('is for technicians only', async () => {
    renderApp('/dashboard/learning-tasks', signedIn(STUDENT));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
  });
});

describe('posting a task', () => {
  const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('checks the form before sending anything', async () => {
    renderApp('/dashboard/learning-tasks/new', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Post this task' }));
    expect(await screen.findByText('Give the task a clear title of at least 5 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose the type of device the task is about.')).toBeInTheDocument();
    expect(screen.getByText('Enter the area or locality, not a full address.')).toBeInTheDocument();
    expect(screen.getByText('Choose the last day students can apply.')).toBeInTheDocument();
    expect(screen.getByText('Confirm that you will supervise and that no hazardous handling is involved.')).toBeInTheDocument();
    expect(opportunityApi.create).not.toHaveBeenCalled();
  });

  it('never offers hazardous device types', async () => {
    renderApp('/dashboard/learning-tasks/new', signedIn(TECHNICIAN));
    const select = await screen.findByLabelText('Device type');
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Laptops' })).toBeInTheDocument());
    expect(within(select).queryByRole('option', { name: 'Monitor' })).not.toBeInTheDocument();
  });

  it('sends the task and opens it', async () => {
    opportunityApi.create.mockResolvedValue({ _id: 'o9' });
    opportunityApi.get.mockResolvedValue(opp({ _id: 'o9', viewerRole: 'supervisor', counts: {} }));
    const { router } = renderApp('/dashboard/learning-tasks/new', signedIn(TECHNICIAN));
    await screen.findByRole('button', { name: 'Post this task' });
    await waitFor(() => expect(within(screen.getByLabelText('Device type')).getByRole('option', { name: 'Laptops' })).toBeInTheDocument());
    fill('Title', 'Diagnose a laptop that will not power on');
    fill('Device type', 'k1');
    fill('Area', 'Indiranagar, Bengaluru');
    fill('Apply by', '2099-01-15');
    fill('Places', '2');
    fill('Useful skills (optional)', 'Multimeter, soldering basics');
    fireEvent.click(screen.getByLabelText(/I will supervise the student/));
    fireEvent.click(screen.getByRole('button', { name: 'Post this task' }));
    await waitFor(() => expect(opportunityApi.create).toHaveBeenCalledWith({
      title: 'Diagnose a laptop that will not power on', description: '', deviceTypeId: 'k1', requiredSkills: ['multimeter', 'soldering basics'], difficulty: 'beginner',
      locationArea: 'Indiranagar, Bengaluru', seats: 2, deadline: new Date('2099-01-15T23:59:59').toISOString(), supervisionAcknowledged: true,
    }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard/learning-tasks/o9'));
    expect(await screen.findByText('Your task is now open for applications.')).toBeInTheDocument();
  });

  it('shows a server refusal next to the field', async () => {
    opportunityApi.create.mockRejectedValue(Object.assign(new Error('Validation failed'), { response: { status: 422, data: { message: 'Validation failed', code: 'VALIDATION_ERROR', errors: [{ field: 'deviceTypeId', message: 'Students cannot take on hazardous devices.' }] } } }));
    renderApp('/dashboard/learning-tasks/new', signedIn(TECHNICIAN));
    await screen.findByRole('button', { name: 'Post this task' });
    await waitFor(() => expect(within(screen.getByLabelText('Device type')).getByRole('option', { name: 'Laptops' })).toBeInTheDocument());
    fill('Title', 'Diagnose a laptop that will not power on');
    fill('Device type', 'k1');
    fill('Area', 'Indiranagar');
    fill('Apply by', '2099-01-15');
    fireEvent.click(screen.getByLabelText(/I will supervise the student/));
    fireEvent.click(screen.getByRole('button', { name: 'Post this task' }));
    expect((await screen.findAllByText('Students cannot take on hazardous devices.')).length).toBeGreaterThan(0);
    expect(opportunityApi.create).toHaveBeenCalledTimes(1);
  });

  it('edits only my own task and sends the changes', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'supervisor', counts: {} }));
    opportunityApi.update.mockResolvedValue({ _id: 'o1' });
    renderApp('/dashboard/learning-tasks/o1/edit', signedIn(TECHNICIAN));
    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('Diagnose a laptop that will not power on');
    expect(screen.queryByLabelText(/I will supervise the student/)).not.toBeInTheDocument();
    fireEvent.change(title, { target: { value: 'Diagnose a dead laptop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(opportunityApi.update).toHaveBeenCalledWith('o1', expect.objectContaining({ title: 'Diagnose a dead laptop', seats: 2, expectedHours: 6 })));
    expect(opportunityApi.update.mock.calls[0][1]).not.toHaveProperty('deadline');
  });

  it('does not let anyone else edit it', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student' }));
    renderApp('/dashboard/learning-tasks/o1/edit', signedIn(TECHNICIAN));
    expect(await screen.findByText('Only the technician who posted this task can edit it.')).toBeInTheDocument();
  });
});

describe('managing a task', () => {
  const task = (over = {}) => opp({ viewerRole: 'supervisor', counts: { applied: 1 }, ...over });

  it('lists the applicants and accepts one', async () => {
    opportunityApi.get.mockResolvedValue(task());
    opportunityApi.applicants.mockResolvedValue(page([asSupervisor()]));
    applicationApi.decide.mockResolvedValue({ _id: 'a1', status: 'accepted' });
    renderApp('/dashboard/learning-tasks/o1', signedIn(TECHNICIAN));
    expect(await screen.findByRole('heading', { name: 'Diagnose a laptop that will not power on', level: 1 })).toBeInTheDocument();
    const card = within(await screen.findByRole('article'));
    expect(card.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(card.getByText('I enjoy fixing laptops.')).toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Accept student' }));
    await waitFor(() => expect(applicationApi.decide).toHaveBeenCalledWith('a1', 'accepted', undefined));
    expect(await screen.findByText('The student has been accepted.')).toBeInTheDocument();
    await waitFor(() => expect(opportunityApi.applicants.mock.calls.length).toBeGreaterThan(1));
  });

  it('says when nobody has applied and filters the applicants', async () => {
    opportunityApi.get.mockResolvedValue(task({ counts: {} }));
    renderApp('/dashboard/learning-tasks/o1', signedIn(TECHNICIAN));
    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'completed' } });
    await waitFor(() => expect(opportunityApi.applicants).toHaveBeenLastCalledWith('o1', expect.objectContaining({ status: 'completed' }), expect.anything()));
  });

  it('closes the task after confirming, and reopens it', async () => {
    opportunityApi.get.mockResolvedValueOnce(task()).mockResolvedValueOnce(task({ status: 'closed' })).mockResolvedValue(task());
    opportunityApi.setStatus.mockResolvedValue({ _id: 'o1' });
    renderApp('/dashboard/learning-tasks/o1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Close task' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Applications still waiting for your answer are declined/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close task' }));
    await waitFor(() => expect(opportunityApi.setStatus).toHaveBeenCalledWith('o1', 'closed'));
    expect(await screen.findByText('The task is closed. Pending applications were declined.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen task' }));
    await waitFor(() => expect(opportunityApi.setStatus).toHaveBeenCalledWith('o1', 'open'));
    expect(await screen.findByText('The task is open for applications again.')).toBeInTheDocument();
  });

  it('shows why reopening was refused', async () => {
    opportunityApi.get.mockResolvedValue(task({ status: 'closed' }));
    opportunityApi.setStatus.mockRejectedValue(apiError('The deadline has passed. Set a new deadline before reopening.', 'DEADLINE_PASSED'));
    renderApp('/dashboard/learning-tasks/o1', signedIn(TECHNICIAN));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen task' }));
    expect(await screen.findByText('The deadline has passed. Set a new deadline before reopening.')).toBeInTheDocument();
  });

  it('does not show a task that belongs to someone else', async () => {
    opportunityApi.get.mockResolvedValue(opp({ viewerRole: 'student' }));
    renderApp('/dashboard/learning-tasks/o1', signedIn(TECHNICIAN));
    expect(await screen.findByText('Only the technician who posted this task can manage it.')).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('shows the right link for each role', async () => {
    renderApp('/dashboard', signedIn(STUDENT));
    const links = await screen.findAllByRole('link', { name: 'My learning' });
    expect(links.every((l) => l.getAttribute('href') === '/dashboard/learning')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Student tasks' })).not.toBeInTheDocument();
  });
  it('gives technicians the task manager', async () => {
    renderApp('/dashboard', signedIn(TECHNICIAN));
    expect(await screen.findByRole('link', { name: 'Student tasks' })).toHaveAttribute('href', '/dashboard/learning-tasks');
    expect(screen.getByRole('link', { name: 'Post a student task' })).toHaveAttribute('href', '/dashboard/learning-tasks/new');
  });
});
