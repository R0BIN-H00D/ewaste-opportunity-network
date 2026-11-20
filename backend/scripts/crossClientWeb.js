'use strict';
// Plays the WEB app against a live API (same endpoints the web services call) for the web <-> mobile shared-data check.
//   node scripts/crossClientWeb.js create <title>   -> web creates a listing
//   node scripts/crossClientWeb.js expect <title>   -> web must see a listing with that title (made by the other client)
const API = process.env.LIVE_API || 'http://localhost:5000/api';
const [, , mode, title] = process.argv;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function main() {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@demo.local', password: 'Demo@12345' }),
  }).then((r) => r.json());
  const auth = { authorization: `Bearer ${login.data.accessToken}` };

  if (mode === 'create') {
    const form = new FormData();
    Object.entries({
      name: title, category: 'laptop', condition: 'fully_working', preferredService: 'reuse', brand: 'WebBrand', model: 'W1',
      modelYear: '2020', purchaseYear: '2021', pickupPreference: 'either', addressArea: 'Indiranagar', city: 'Bengaluru',
      agentPhone: '9876543210', status: 'listed',
    }).forEach(([k, v]) => form.append(k, v));
    form.append('photos', new Blob([PNG], { type: 'image/png' }), 'web.png');
    const res = await fetch(`${API}/devices`, { method: 'POST', headers: auth, body: form });
    const body = await res.json();
    if (res.status !== 201) throw new Error(`web create failed ${res.status}: ${JSON.stringify(body)}`);
    console.log(`WEB created "${title}" (id ${body.data._id})`);
  } else if (mode === 'expect') {
    const res = await fetch(`${API}/devices?mine=true&limit=50`, { headers: auth });
    const body = await res.json();
    const items = body.data.items || body.data;
    const hit = items.find((d) => (d.title || d.name) === title);
    if (!hit) throw new Error(`WEB cannot see "${title}". Saw: ${items.map((d) => d.title || d.name).join(' | ')}`);
    console.log(`WEB sees "${title}" (id ${hit._id}) created by the other client`);
  } else {
    throw new Error('mode must be create|expect');
  }
}
main().catch((e) => { console.error('FAIL', e.message); process.exitCode = 1; });
