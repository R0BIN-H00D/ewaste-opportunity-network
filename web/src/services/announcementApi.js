import { api } from './api';

// The banner. Public: visitors get the announcements for everyone, a signed-in person also gets those for their role.
export const announcementApi = {
  list: () => api.get('/announcements').then((r) => r.data.data),
};
