// Public site copy. Education articles live here until the admin-managed API (P9) replaces them.
export const HOW_STEPS = [
  { title: 'List your device', text: 'Add photos, the condition and what you would like to happen: repair, reuse, donation, refurbishment or recycling.' },
  { title: 'Get matched', text: 'Verified technicians, students, refurbishers and recycling centres nearby can see your listing and respond.' },
  { title: 'Hand it over safely', text: 'Agree a pickup or drop-off. Your exact address is shared only after you accept a request.' },
  { title: 'See your impact', text: 'Completed, verified activities earn Green Score points and count towards the platform impact.' },
];

export const AUDIENCES = [
  { id: 'repair', title: 'Repair services', text: 'Find verified technicians for repairs, with quotes you can compare.', to: '/services', cta: 'Find a technician' },
  { id: 'students', title: 'Student opportunities', text: 'Students learn hands-on skills by assisting with repairs and earn certificates.', to: '/opportunities', cta: 'See opportunities' },
  { id: 'donate', title: 'Donation marketplace', text: 'Give working devices to schools, colleges and organisations that need them.', to: '/marketplace', cta: 'See donations' },
  { id: 'refurbished', title: 'Refurbished products', text: 'Buy devices that were repaired and tested by verified refurbishers.', to: '/marketplace', cta: 'Browse products' },
  { id: 'recycle', title: 'Recycling partners', text: 'Send what cannot be saved to authorised centres that recycle responsibly.', to: '/services', cta: 'Find a centre' },
];

export const FAQ = [
  { q: 'Is it free to use?', a: 'Listing a device and browsing are free. Providers may agree their own prices for repairs or refurbished products.' },
  { q: 'Is my data safe on a device I hand over?', a: 'Back up and erase your data before handover. Every listing includes a data-protection checklist, and our learning pages explain how to wipe each type of device.' },
  { q: 'Who can see my address?', a: 'Only an approximate area is shown publicly. Your exact location is shared only with the person you accept for a pickup.' },
  { q: 'How are technicians and recyclers verified?', a: 'Providers submit identity and qualification or authorisation documents. An administrator reviews them before the account can offer services.' },
  { q: 'What happens to devices that cannot be repaired?', a: 'Choose recycling or spare parts when you list. Authorised recycling centres collect them and record what happened.' },
  { q: 'Can I donate a broken device?', a: 'Donations are for working devices. Broken ones are better routed to repair, spare parts or recycling.' },
];

export const EDUCATION_TOPICS = [
  {
    slug: 'the-e-waste-problem',
    title: 'The e-waste problem',
    summary: 'Why discarded electronics are one of the fastest-growing waste streams, and why it matters.',
    points: [
      'Phones, laptops and chargers contain metals that took energy and mining to produce, and most of that value is lost when a device is thrown away.',
      'Some components contain hazardous substances such as lead, mercury and cadmium. In landfills or open burning they can contaminate soil, water and air.',
      'Informal recycling, where devices are broken up by hand or burned for copper, harms the health of the people doing the work.',
      'Short product lifetimes and hard-to-repair designs mean devices are replaced long before they stop being useful.',
    ],
    action: 'Keep devices in use for longer, repair before replacing, and always hand old electronics to a reuse or authorised recycling channel.',
  },
  {
    slug: 'safe-disposal',
    title: 'Safe disposal',
    summary: 'How to get rid of electronics without harming people or the environment.',
    points: [
      'Never put electronics in household waste or burn them. Batteries in particular can start fires in collection trucks and bins.',
      'Check whether the device still works. Working devices should be reused or donated; broken ones should be repaired or recycled.',
      'Use an authorised recycling centre. On this platform, recycling partners are verified by an administrator before they appear.',
      'Remove batteries that can be removed and keep them separate when you hand over the device.',
    ],
    action: 'List the device, choose Recycling as the preferred service, and agree a pickup or drop-off with a verified centre.',
  },
  {
    slug: 'reuse-and-donation',
    title: 'Reuse and donation',
    summary: 'Giving working devices a second owner is usually the most valuable option.',
    points: [
      'Extending a device\'s life by a few years avoids the impact of making a new one, which is where most of its environmental cost lies.',
      'Schools, colleges and community organisations can often use older laptops, tablets and monitors for teaching and administration.',
      'A good donation works, is clean, and comes with its charger. Say honestly what does not work.',
      'Always wipe personal data first and sign out of accounts so the recipient can set the device up for themselves.',
    ],
    action: 'List the device with the Donation service, then accept a request from a verified recipient organisation.',
  },
  {
    slug: 'benefits-of-repair',
    title: 'The benefits of repair',
    summary: 'Why fixing a device often beats replacing it.',
    points: [
      'Many faults, such as a worn battery, a cracked screen or a failed charging port, are inexpensive to fix compared with a new device.',
      'Repair keeps money in the local economy and creates skilled work for technicians and trainee students.',
      'A repaired device can be used, resold or donated, and it avoids creating new waste.',
      'Ask for a quotation before agreeing, and prefer technicians who explain the fault and give a warranty on the work.',
    ],
    action: 'List the device with the Repair service and compare quotations from verified technicians near you.',
  },
  {
    slug: 'recycling-explained',
    title: 'Recycling explained',
    summary: 'What happens to a device at an authorised recycling centre.',
    points: [
      'Devices are sorted, and parts that can still be used are removed first. The rest is dismantled to separate plastics, glass and metals.',
      'Circuit boards and batteries need specialised processing so that valuable metals are recovered and hazardous material is contained.',
      'Responsible centres keep records of what they receive and how it was processed. Ask for a certificate when you need one.',
      'Recycling is the last step, after repair and reuse. It recovers materials but not the full value of a working device.',
    ],
    action: 'If a device cannot be repaired or reused, list it for recycling and choose a verified centre.',
  },
  {
    slug: 'protect-your-data',
    title: 'Protect your data before handover',
    summary: 'Simple steps so nobody else can read your files, messages or accounts.',
    points: [
      'Back up photos, documents and contacts first. Once a device is wiped, they cannot be recovered.',
      'Sign out of every account and turn off device-finding and lock features, such as Find My Device or an activation lock.',
      'Use the factory reset option in the settings. For computers, enable full-disk encryption before resetting when it is available.',
      'Remove SIM cards and memory cards. If a device cannot be reset because it is broken, say so on the listing, and consider recycling with a centre that destroys storage securely.',
    ],
    action: 'Tick the data-protection checklist when you list a device and keep a note of what you erased.',
  },
  {
    slug: 'sustainability-at-home',
    title: 'Sustainability at home',
    summary: 'Everyday habits that reduce how much e-waste you create.',
    points: [
      'Buy only what you need, and choose devices that are repairable and have replaceable batteries.',
      'Protect devices with cases and screen protectors, and charge them sensibly to keep batteries healthy for longer.',
      'Keep cables and chargers instead of replacing the full set with every new device.',
      'Pass on, sell or donate devices you no longer use rather than keeping them in a drawer, where they lose value.',
    ],
    action: 'Review the devices at home once a year and list the ones you no longer use.',
  },
];

export const LEGAL_NOTE =
  'This is a development draft written for the project. It must be reviewed by a qualified lawyer before the service is made available to the public.';

export const PRIVACY = [
  ['What we collect', 'Account details (name, email, optional phone), the listings and requests you create, photos you upload, verification documents (providers only), and technical data needed to keep the service secure such as sign-in time and IP address.'],
  ['How we use it', 'To run your account, show listings, match you with providers, send service emails and prevent abuse. We do not sell your personal data.'],
  ['Location', 'Your exact address and coordinates are visible only to you and, after you accept a request, to the provider handling it. Public pages show an approximate area.'],
  ['Verification documents', 'Documents submitted by providers are stored privately and are visible only to administrators who review them.'],
  ['Cookies and storage', 'We use one httpOnly cookie to keep you signed in and a local setting to remember your theme. We do not use advertising cookies.'],
  ['Your choices', 'You can edit your details at any time and delete your account from Settings. Deleting your account removes your personal profile and unpublishes your listings.'],
  ['Contact', 'Questions about privacy can be sent through the Contact page.'],
];

export const TERMS = [
  ['Using the service', 'You must provide accurate information and keep your password private. You are responsible for activity on your account.'],
  ['Listings', 'List only devices you own or may give away. Describe the condition honestly. Do not list stolen, counterfeit or prohibited items.'],
  ['Your data on devices', 'You are responsible for backing up and erasing personal data before handing over a device.'],
  ['Providers', 'Technicians, students, refurbishers and recycling centres must be verified by an administrator before offering services. Verification can be withdrawn if information is false.'],
  ['Transactions and safety', 'Agree prices and handover details directly with the other person. Meet in safe places and inspect devices before accepting them.'],
  ['Reports and removal', 'Listings and accounts that break these terms or the law can be removed. You can report content you think is unsafe, fraudulent or inappropriate.'],
  ['Liability', 'The platform connects people and does not own, repair or transport the devices. To the extent the law allows, we are not liable for the quality of services provided by others.'],
  ['Changes', 'We may update these terms. Continued use after an update means you accept the new version.'],
];
