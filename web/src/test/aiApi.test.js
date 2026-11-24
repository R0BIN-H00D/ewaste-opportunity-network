import { api } from '../services/api';
import { aiApi, shrinkImage } from '../services/aiApi';

const photo = (name = 'a.png', size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' });

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.createImageBitmap;
});

describe('smaller photos for the AI', () => {
  it('gives the photo back when the browser cannot make a smaller one', async () => {
    const original = photo();
    expect(await shrinkImage(original)).toBe(original); // jsdom has no createImageBitmap
  });

  it('gives the photo back when something goes wrong', async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('cannot decode'));
    const original = photo();
    expect(await shrinkImage(original)).toBe(original);
  });

  it('leaves a photo that is already small and short alone', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600 });
    const original = photo('small.png', 50 * 1024);
    expect(await shrinkImage(original)).toBe(original);
  });

  it('makes a big photo smaller, as a JPEG', async () => {
    globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 4000, height: 3000 });
    const drawn = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (...args) => drawn.push(args) }),
        toBlob(cb) { drawn.push(['size', this.width, this.height]); cb(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' })); },
      };
    });
    const small = await shrinkImage(photo('big.png', 4 * 1024 * 1024));
    expect(small.type).toBe('image/jpeg');
    expect(small.name).toBe('big.jpg');
    expect(small.size).toBe(1000);
    expect(drawn.find((d) => d[0] === 'size').slice(1)).toEqual([1024, 768]); // the long side is 1024
  });
});

describe('analyzing a device', () => {
  it('sends at most two photos, and the words', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: { source: 'ai' } } });
    await aiApi.analyzeDevice([photo('1.png'), photo('2.png'), photo('3.png')], '  old laptop  ');
    const form = post.mock.calls[0][1];
    expect(post.mock.calls[0][0]).toBe('/ai/analyze-device');
    expect(form.getAll('photos')).toHaveLength(2);
    expect(form.get('text')).toBe('old laptop');
  });

  it('waits long enough for a slow free service', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: {} } });
    await aiApi.analyzeDevice([photo()], '');
    expect(post.mock.calls[0][2].timeout).toBeGreaterThanOrEqual(60000);
  });
});
