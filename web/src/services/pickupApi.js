import { api } from './api';

// Every pickup, collection and handover the signed-in person is part of, across repairs, donations, refurbishment and recycling (P5-26).
export const pickupApi = {
  list: (params, signal) =>
    api
      .get('/pickups', { params: Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null)), signal })
      .then((r) => ({ items: r.data.data, meta: r.data.meta })),
};
