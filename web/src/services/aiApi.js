import { api } from './api';

export const aiApi = {
  /** Asks what a device is from its words and, optionally, one photo. A suggestion only: nothing is saved by asking. */
  classify: ({ title, description }, photo) => {
    const form = new FormData();
    if (title?.trim()) form.append('title', title.trim());
    if (description?.trim()) form.append('description', description.trim());
    if (photo) form.append('photo', photo);
    return api.post('/ai/classify', form).then((r) => r.data.data);
  },
};