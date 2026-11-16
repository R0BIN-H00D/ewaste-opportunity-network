import { configureStore } from '@reduxjs/toolkit';
import ui from './uiSlice';
import auth, { sessionExpired } from './authSlice';
import { onSessionExpired } from '../services/api';

// Further slices (notifications P8, etc.) are added as modules land.
export const makeStore = (preloadedState) => configureStore({ reducer: { ui, auth }, preloadedState });
export const store = makeStore();

// A failed silent refresh (session revoked/expired) signs the UI out.
onSessionExpired(() => store.dispatch(sessionExpired()));
