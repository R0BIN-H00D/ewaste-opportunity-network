import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { makeStore } from '../store';
import { routeConfig } from '../routes';

export const USER = { _id: 'u1', name: 'Asha Rao', email: 'asha@test.local', role: 'user', status: 'active', emailVerified: true };
export const TECH = { ...USER, _id: 'u2', role: 'technician', status: 'pending_verification' };

export const signedIn = (user = USER, extra = {}) => ({
  auth: { status: 'authenticated', user, profile: null, roleProfile: null, verification: null, ...extra },
});
export const anonymous = () => ({ auth: { status: 'anonymous', user: null, profile: null, roleProfile: null, verification: null } });

/** Renders the real route table with a fresh store (optionally preloaded) at the given URL. */
export function renderApp(path, preloadedState) {
  const store = makeStore(preloadedState);
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] });
  const utils = render(
    <Provider store={store}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Provider>,
  );
  return { store, router, ...utils };
}

/** Renders a custom route table (for testing guards in isolation). */
export function renderRoutes(routes, path, preloadedState) {
  const store = makeStore(preloadedState);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Provider>,
  );
  return { store, router };
}
