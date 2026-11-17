'use strict';
require('./helpers/env');
const fs = require('fs');
const env = require('../src/config/env');
const storage = require('../src/services/integrations/storage');
const { PNG } = require('./helpers/factories');

const png = () => ({ buffer: PNG, size: PNG.length, mimetype: 'image/png', sniffedMime: 'image/png' });
const pdf = () => ({ buffer: Buffer.from('%PDF-1.4 test'), size: 13, mimetype: 'application/pdf', sniffedMime: 'application/pdf' });

/** A stand-in for the Cloudinary SDK: records what it was asked and answers like the real one. */
function fakeSdk() {
  const calls = { uploads: [], destroyed: [], urls: [] };
  const sdk = {
    calls,
    failUploadsAfter: Infinity,
    uploader: {
      upload_stream(options, cb) {
        const chunks = [];
        return {
          end(buffer) {
            chunks.push(buffer);
            if (calls.uploads.length >= sdk.failUploadsAfter) return cb(new Error('cloud is down'));
            calls.uploads.push(options);
            return cb(null, { public_id: `${options.folder}/${options.public_id}`, bytes: buffer.length });
          },
        };
      },
      async destroy(id, options) { calls.destroyed.push([id, options]); return { result: 'ok' }; },
    },
    url(id, options) { calls.urls.push([id, options]); return `https://cdn.example/${options.type || 'upload'}/${id}${options.sign_url ? '?sig=abc' : ''}`; },
  };
  return sdk;
}

const saved = { driver: env.STORAGE_DRIVER, name: env.CLOUDINARY_CLOUD_NAME, key: env.CLOUDINARY_API_KEY, secret: env.CLOUDINARY_API_SECRET, prod: env.isProd };
const useCloud = (sdk, creds = true) => {
  env.STORAGE_DRIVER = 'cloudinary';
  env.CLOUDINARY_CLOUD_NAME = creds ? 'demo' : '';
  env.CLOUDINARY_API_KEY = creds ? 'key' : '';
  env.CLOUDINARY_API_SECRET = creds ? 'secret' : '';
  storage._setCloudinary(sdk);
};
afterEach(() => {
  Object.assign(env, { STORAGE_DRIVER: saved.driver, CLOUDINARY_CLOUD_NAME: saved.name, CLOUDINARY_API_KEY: saved.key, CLOUDINARY_API_SECRET: saved.secret, isProd: saved.prod });
  storage._setCloudinary(null);
  jest.restoreAllMocks();
});

describe('the Cloudinary driver', () => {
  it('stores a public image on the CDN and returns an optimised address', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    const file = await storage.save(png(), { folder: 'devices/u1' });
    const [options] = sdk.calls.uploads;
    expect(options).toMatchObject({ folder: 'ewaste/public/devices/u1', resource_type: 'image', type: 'upload', overwrite: false });
    expect(options.public_id).toMatch(/^[0-9a-f]{32}$/);
    expect(file).toMatchObject({ storage: 'cloudinary', mime: 'image/png', bytes: PNG.length });
    expect(file.publicId).toBe(`ewaste/public/devices/u1/${options.public_id}`);
    expect(file.url).toBe(`https://cdn.example/upload/${file.publicId}`);
    expect(sdk.calls.urls[0][1]).toMatchObject({ secure: true, fetch_format: 'auto', quality: 'auto' });
  });

  it('stores a private document as an authenticated upload with no public address', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    const file = await storage.save(pdf(), { folder: 'verification/u1', isPrivate: true });
    const [options] = sdk.calls.uploads;
    expect(options).toMatchObject({ folder: 'ewaste/private/verification/u1', resource_type: 'raw', type: 'authenticated' });
    expect(options.public_id).toMatch(/^[0-9a-f]{32}\.pdf$/); // a raw file keeps its extension
    expect(file.url).toBeUndefined();
    expect(file.storage).toBe('cloudinary');
  });

  it('keeps a folder name from escaping its place', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    await storage.save(png(), { folder: '../../etc/passwd' });
    expect(sdk.calls.uploads[0].folder).toBe('ewaste/public/etc/passwd');
  });

  it('refuses a file type it does not know, before talking to the cloud', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    await expect(storage.save({ buffer: Buffer.from('x'), size: 1, mimetype: 'text/html', sniffedMime: 'text/html' })).rejects.toMatchObject({ statusCode: 422 });
    expect(sdk.calls.uploads).toHaveLength(0);
  });

  it('says the file could not be stored when the cloud is down, without leaking the reason', async () => {
    const sdk = fakeSdk();
    sdk.failUploadsAfter = 0;
    useCloud(sdk);
    await expect(storage.save(png())).rejects.toMatchObject({ statusCode: 502, code: 'STORAGE_UNAVAILABLE', message: 'The file could not be stored. Please try again.' });
  });

  it('removes the files already stored when a later one in the same batch fails', async () => {
    const sdk = fakeSdk();
    sdk.failUploadsAfter = 2;
    useCloud(sdk);
    await expect(storage.saveMany([png(), png(), png()], { folder: 'devices/u1' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(sdk.calls.destroyed).toHaveLength(2);
    expect(sdk.calls.destroyed.every(([id, o]) => id.startsWith('ewaste/public/') && o.type === 'upload' && o.resource_type === 'image')).toBe(true);
  });

  it('deletes with the right kind and resource type, and leaves unknown ids alone', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    await storage.remove('ewaste/public/devices/u1/abc');
    await storage.remove('ewaste/private/verification/u1/abc.pdf');
    await storage.remove('something/else');
    await storage.remove('');
    await storage.remove(undefined);
    expect(sdk.calls.destroyed.map(([id, o]) => [id, o.type, o.resource_type])).toEqual([
      ['ewaste/public/devices/u1/abc', 'upload', 'image'],
      ['ewaste/private/verification/u1/abc.pdf', 'authenticated', 'raw'],
    ]);
  });

  it('does not fail a request when a delete fails', async () => {
    const sdk = fakeSdk();
    sdk.uploader.destroy = async () => { throw new Error('nope'); };
    useCloud(sdk);
    await expect(storage.remove('ewaste/public/devices/u1/abc')).resolves.toBeUndefined();
  });
});

describe('reading a private document', () => {
  it('fetches it with a short-lived signed address made and used on the server', async () => {
    const sdk = fakeSdk();
    useCloud(sdk);
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from('PDFDATA').buffer.slice(0, 7) });
    const opened = await storage.openPrivate('ewaste/private/verification/u1/abc.pdf');
    expect(Buffer.isBuffer(opened.buffer)).toBe(true);
    expect(opened.path).toBeUndefined();
    const [, options] = sdk.calls.urls.at(-1);
    expect(options).toMatchObject({ sign_url: true, type: 'authenticated', resource_type: 'raw', secure: true });
    const lifetime = options.expires_at - Math.floor(Date.now() / 1000);
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(60);
    expect(spy.mock.calls[0][0]).toContain('sig=abc');
  });

  it('says the file is missing when the cloud cannot give it, and refuses anything that is not a private document', async () => {
    useCloud(fakeSdk());
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 });
    await expect(storage.openPrivate('ewaste/private/verification/u1/abc.pdf')).rejects.toMatchObject({ statusCode: 404 });
    await expect(storage.openPrivate('ewaste/public/devices/u1/abc')).rejects.toMatchObject({ statusCode: 404 }); // a public file is not a document
    await expect(storage.openPrivate('../../etc/passwd')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('still reads a file that was written to disk before the switch', async () => {
    useCloud(fakeSdk());
    env.STORAGE_DRIVER = 'local';
    const file = await storage.save(pdf(), { folder: 'verification/old', isPrivate: true });
    env.STORAGE_DRIVER = 'cloudinary';
    const opened = await storage.openPrivate(file.publicId);
    expect(fs.existsSync(opened.path)).toBe(true);
    await storage.remove(file.publicId);
    expect(fs.existsSync(opened.path)).toBe(false);
  });

  it('never reads outside the private folder on disk', async () => {
    await expect(storage.openPrivate('_private/../../../package.json')).rejects.toMatchObject({ statusCode: 404 });
    await expect(storage.openPrivate('public/devices/x/a.png')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('choosing a driver', () => {
  it('uses the disk by default', async () => {
    expect(storage.driver()).toBe('local');
    const file = await storage.save(png(), { folder: 'devices/u1' });
    expect(file.storage).toBe('local');
    await storage.remove(file.publicId);
  });

  it('falls back to the disk when Cloudinary is chosen but not set up, and keeps working', async () => {
    const sdk = fakeSdk();
    useCloud(sdk, false);
    expect(storage.driver()).toBe('local');
    const file = await storage.save(png(), { folder: 'devices/u1' });
    expect(file.storage).toBe('local');
    expect(sdk.calls.uploads).toHaveLength(0);
    await storage.remove(file.publicId);
  });

  it('refuses to fall back in production, rather than quietly writing to a disk that will vanish', async () => {
    useCloud(fakeSdk(), false);
    env.isProd = true;
    expect(() => storage.driver()).toThrow(/not configured/);
    await expect(storage.save(png())).rejects.toMatchObject({ statusCode: 500, code: 'STORAGE_NOT_CONFIGURED' });
  });
});