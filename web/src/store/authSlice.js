import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { authApi } from '../services/authApi';
import { refreshSession, setAccessToken } from '../services/api';
import { toApiError } from '../utils/errors';

// status: idle (not checked yet) -> loading -> authenticated | anonymous
const initialState = { status: 'idle', user: null, profile: null, roleProfile: null, verification: null };

const reject = (err, { rejectWithValue }) => rejectWithValue(toApiError(err));

/** On page load: if the httpOnly cookie holds a valid session, restore it. Runs once (guarded by `condition`). */
export const bootstrapAuth = createAsyncThunk(
  'auth/bootstrap',
  async (_, thunkApi) => {
    try {
      await refreshSession();
      return await authApi.me();
    } catch (err) {
      setAccessToken(null);
      return reject(err, thunkApi);
    }
  },
  { condition: (_, { getState }) => getState().auth.status === 'idle' },
);

async function startSession(promise) {
  const session = await promise;
  setAccessToken(session.accessToken);
  return authApi.me();
}

export const loginUser = createAsyncThunk('auth/login', async (body, thunkApi) => {
  try {
    return await startSession(authApi.login(body));
  } catch (err) {
    return reject(err, thunkApi);
  }
});

export const registerUser = createAsyncThunk('auth/register', async (body, thunkApi) => {
  try {
    return await startSession(authApi.register(body));
  } catch (err) {
    return reject(err, thunkApi);
  }
});

/** Re-reads user, profiles and verification state after any change. */
export const loadMe = createAsyncThunk('auth/loadMe', async (_, thunkApi) => {
  try {
    return await authApi.me();
  } catch (err) {
    return reject(err, thunkApi);
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try {
    await authApi.logout();
  } finally {
    setAccessToken(null); // the UI always ends up signed out, even if the network call failed
  }
});

const apply = (state, { user, profile, roleProfile, verification }) => {
  state.status = 'authenticated';
  state.user = user;
  state.profile = profile || null;
  state.roleProfile = roleProfile || null;
  state.verification = verification || null;
};
const clear = () => ({ ...initialState, status: 'anonymous' });

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired: clear,
    signedOut: clear,
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.pending, (s) => {
        s.status = 'loading';
      })
      .addCase(bootstrapAuth.fulfilled, (s, a) => apply(s, a.payload))
      .addCase(bootstrapAuth.rejected, (s, a) => (a.meta.condition ? s : clear()))
      .addCase(loginUser.fulfilled, (s, a) => apply(s, a.payload))
      .addCase(registerUser.fulfilled, (s, a) => apply(s, a.payload))
      .addCase(loadMe.fulfilled, (s, a) => apply(s, a.payload))
      .addCase(logoutUser.fulfilled, clear)
      .addCase(logoutUser.rejected, clear);
  },
});

export const { sessionExpired, signedOut } = authSlice.actions;
export default authSlice.reducer;

export const PROVIDER_ROLES = ['technician', 'student', 'refurbisher', 'recycler'];
/** Where each role lands after login. Role dashboards are built in later phases. */
export const homePathFor = () => '/dashboard';
