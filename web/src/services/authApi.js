import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);

export const authApi = {
  register: (body) => data(api.post('/auth/register', body)),
  login: (body) => data(api.post('/auth/login', body)),
  logout: () => data(api.post('/auth/logout', {})),
  logoutAll: () => data(api.post('/auth/logout-all')),
  me: () => data(api.get('/auth/me')),
  forgotPassword: (email) => data(api.post('/auth/forgot-password', { email })),
  resetPassword: (token, password) => data(api.post('/auth/reset-password', { token, password })),
  verifyEmail: (token) => data(api.post('/auth/verify-email', { token })),
  verifyEmailCode: (code) => data(api.post('/auth/verify-email-code', { code })),
  resendVerification: () => data(api.post('/auth/resend-verification')),
  changePassword: (body) => data(api.post('/auth/change-password', body)),
};

export const userApi = {
  updateMe: (body) => data(api.patch('/users/me', body)),
  updateProfile: (body) => data(api.patch('/users/me/profile', body)),
  updateRoleProfile: (body) => data(api.patch('/users/me/role-profile', body)),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return data(api.post('/users/me/avatar', form));
  },
  removeAvatar: () => data(api.delete('/users/me/avatar')),
  deleteAccount: (password) => data(api.delete('/users/me', { data: { password } })),
};

export const verificationApi = {
  status: () => data(api.get('/verification/status')),
  submit: (docType, files) => {
    const form = new FormData();
    form.append('docType', docType); // text field first so the server sees it with the files
    files.forEach((f) => form.append('documents', f));
    return data(api.post('/verification/documents', form));
  },
  remove: (id) => data(api.delete(`/verification/documents/${id}`)),
};
