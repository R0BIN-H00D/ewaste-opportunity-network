// Original spot illustrations for empty states (P4-05). They are drawn here in code, so there is nothing to license or download,
// they stay a few hundred bytes each, and they follow the theme: every shape uses `currentColor` at different strengths, and the
// parent sets the colour (green on light, mint on dark). They are decoration only, so they are hidden from screen readers.
const SIZE = { width: 160, height: 120, viewBox: '0 0 160 120', fill: 'none', 'aria-hidden': true, focusable: 'false' };

const Ground = () => <ellipse cx="80" cy="108" rx="52" ry="7" fill="currentColor" opacity=".08" />;

/** A phone and a laptop side by side: devices that are waiting for a home. */
function Devices() {
  return (
    <svg {...SIZE}>
      <Ground />
      <rect x="22" y="30" width="78" height="52" rx="6" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="2.5" />
      <rect x="29" y="37" width="64" height="38" rx="3" fill="currentColor" opacity=".18" />
      <path d="M12 88h98l-6 8H18z" fill="currentColor" opacity=".35" />
      <rect x="104" y="46" width="34" height="56" rx="7" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="2.5" />
      <rect x="109" y="53" width="24" height="38" rx="2" fill="currentColor" opacity=".2" />
      <circle cx="121" cy="97" r="2" fill="currentColor" />
      <path d="M126 20c4 0 7 3 7 7M126 12c8 0 15 7 15 15" stroke="#A3E635" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A magnifying glass over an empty page: a search with no answer yet. */
function Search() {
  return (
    <svg {...SIZE}>
      <Ground />
      <rect x="34" y="16" width="64" height="82" rx="8" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="2.5" />
      <path d="M46 36h40M46 48h28M46 60h34" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".3" />
      <circle cx="102" cy="68" r="22" fill="#34D399" opacity=".18" />
      <circle cx="102" cy="68" r="22" stroke="currentColor" strokeWidth="4" />
      <path d="M118 84l16 16" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M94 68h16" stroke="#A3E635" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Three chasing arrows around a leaf: recycling. */
function Recycle() {
  return (
    <svg {...SIZE}>
      <Ground />
      <circle cx="80" cy="56" r="40" fill="currentColor" opacity=".08" />
      <path d="M80 22l14 22H66z" fill="currentColor" opacity=".85" />
      <path d="M112 74l-24 4 10-20z" fill="currentColor" opacity=".55" />
      <path d="M48 74l24 4-10-20z" fill="currentColor" opacity=".35" />
      <path d="M94 44c14 6 22 18 20 30M66 44C52 50 44 62 46 74M60 82c12 10 28 10 40 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".6" />
      <path d="M80 50c10 0 14 8 14 16-9 0-14-6-14-16z" fill="#A3E635" />
      <path d="M80 50c-2 8-2 14 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** An open tray with a card dropping in: nothing here yet (messages, notifications, requests). */
function Inbox() {
  return (
    <svg {...SIZE}>
      <Ground />
      <path d="M26 66l16-34h76l16 34v28a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M26 66h36a6 6 0 0 1 6 6 12 12 0 0 0 24 0 6 6 0 0 1 6-6h36" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="54" y="12" width="52" height="30" rx="5" fill="#34D399" opacity=".25" stroke="currentColor" strokeWidth="2.5" />
      <path d="M62 23h28M62 31h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/** A folded map with a pin. */
function MapPin() {
  return (
    <svg {...SIZE}>
      <Ground />
      <path d="M22 34l36-12 44 12 36-12v66l-36 12-44-12-36 12z" fill="currentColor" opacity=".1" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M58 22v66M102 34v66" stroke="currentColor" strokeWidth="2" opacity=".35" />
      <path d="M80 18c-12 0-20 9-20 20 0 15 20 34 20 34s20-19 20-34c0-11-8-20-20-20z" fill="#A3E635" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="80" cy="38" r="7" fill="currentColor" />
    </svg>
  );
}

/** A wrench crossed with a screwdriver: repairs and technicians. */
function Tools() {
  return (
    <svg {...SIZE}>
      <Ground />
      <circle cx="80" cy="58" r="40" fill="currentColor" opacity=".08" />
      <path d="M52 92l34-34" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <path d="M96 22a18 18 0 0 0-20 24l-6 6 14 14 6-6a18 18 0 0 0 24-20l-10 10-10-4-4-10z" fill="currentColor" opacity=".8" />
      <path d="M108 92L74 58" stroke="#34D399" strokeWidth="9" strokeLinecap="round" />
      <path d="M108 92l6 6" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <circle cx="52" cy="92" r="4" fill="#A3E635" />
    </svg>
  );
}

/** A heart held in an open hand: donations and giving. */
function Gift() {
  return (
    <svg {...SIZE}>
      <Ground />
      <rect x="40" y="52" width="80" height="48" rx="6" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="2.5" />
      <rect x="34" y="40" width="92" height="16" rx="5" fill="currentColor" opacity=".25" stroke="currentColor" strokeWidth="2.5" />
      <path d="M80 40v60" stroke="#A3E635" strokeWidth="7" />
      <path d="M80 40c-6-18-26-18-26-6 0 8 14 6 26 6zM80 40c6-18 26-18 26-6 0 8-14 6-26 6z" fill="#34D399" opacity=".5" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** A graduation cap on an open book: learning and opportunities for students. */
function Learn() {
  return (
    <svg {...SIZE}>
      <Ground />
      <path d="M24 80c18-8 38-8 56 2 18-10 38-10 56-2v18c-18-8-38-8-56 2-18-10-38-10-56-2z" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M80 82v18" stroke="currentColor" strokeWidth="2.5" />
      <path d="M80 18l44 18-44 18-44-18z" fill="currentColor" opacity=".85" />
      <path d="M56 48v14c8 8 40 8 48 0V48" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity=".6" />
      <path d="M124 36v22" stroke="#A3E635" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="124" cy="62" r="4" fill="#A3E635" />
    </svg>
  );
}

const ART = { devices: Devices, search: Search, recycle: Recycle, inbox: Inbox, map: MapPin, tools: Tools, gift: Gift, learn: Learn };
export const ART_NAMES = Object.keys(ART);

/** One illustration by name, or nothing for a name that does not exist. Size it with `className`. */
export default function Art({ name, className = '' }) {
  const Piece = ART[name];
  if (!Piece) return null;
  return (
    <span className={`inline-block text-primary dark:text-primary-tint [&>svg]:h-full [&>svg]:w-full ${className}`} data-art={name}>
      <Piece />
    </span>
  );
}
