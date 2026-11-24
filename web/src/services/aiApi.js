import { api } from './api';

const data = (promise) => promise.then((res) => res.data.data);

// Free AI help (Gemini free tier on the server, plain rules when it is off). Photos are sent only when the person asks.
/**
 * A smaller copy of a photo for the AI (at most `maxSide` pixels on the long side, as a JPEG): the AI does not need a 5 MB picture, and
 * a small upload is quicker and easier on the free service. Gives the original back when the browser cannot do it.
 */
export async function shrinkImage(file, maxSide = 1024) {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 300 * 1024) return file; // already small
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export const aiApi = {
  status: () => data(api.get('/ai/status')),
  /** `photos` are File objects (the first two are sent, made smaller); `text` is whatever the person already wrote. */
  analyzeDevice: async (photos = [], text = '') => {
    const form = new FormData();
    if (text.trim()) form.append('text', text.trim().slice(0, 1000));
    const small = await Promise.all(photos.slice(0, 2).map((f) => shrinkImage(f))); // two small photos are enough
    small.forEach((f) => form.append('photos', f));
    return data(api.post('/ai/analyze-device', form, { timeout: 70000 }));
  },
  advice: (body) => data(api.post('/ai/advice', body, { timeout: 60000 })),
};

// Who fits a device of mine (each answer carries a score and the reasons).
export const matchApi = {
  forListing: (listingId, kind, signal) => api.get(`/matching/listing/${listingId}/${kind}`, { signal }).then((r) => r.data.data),
};
