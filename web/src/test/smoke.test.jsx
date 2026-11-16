import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { store } from '../store';
import { routeConfig } from '../routes';

vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: () => Promise.resolve([]) },
  deviceApi: { list: () => Promise.resolve({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 12 } }) },
  reportApi: {},
}));

// Never hit the real backend from unit tests.
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const renderAt = (path) =>
  render(
    <Provider store={store}>
      <RouterProvider
        router={createMemoryRouter(routeConfig, { initialEntries: [path] })}
        future={{ v7_startTransition: true }}
      />
    </Provider>,
  );

describe('app shell', () => {
  it('renders the hero headline and both CTAs', async () => {
    renderAt('/');
    await screen.findByText(/API: online/i);
    expect(screen.getByRole('heading', { level: 1, name: /give your electronics a second life/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /list your e-waste/i })[0]).toHaveAttribute('href', '/list-device');
    expect(screen.getAllByRole('link', { name: /explore opportunities/i })[0]).toHaveAttribute('href', '/opportunities');
  });

  it('shows a 404 page for unknown routes', async () => {
    renderAt('/does-not-exist');
    await screen.findByText(/API: online/i);
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
