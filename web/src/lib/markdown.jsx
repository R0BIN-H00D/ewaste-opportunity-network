import { Fragment } from 'react';

// A small, safe Markdown reader for learning-centre articles. It builds React elements itself and never inserts HTML, so
// text such as "<script>" is shown as text and cannot run. Supported: headings (# ## ###), bullet and numbered lists,
// paragraphs, **bold**, *italic*, `code` and [links](https://...). Links must be http(s), mailto or a path on this site.

const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/))/i;
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

/** Splits a line of text into strings and inline elements. */
function inline(text, keyBase) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em] dark:bg-white/10">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (!SAFE_LINK.test(href)) return <Fragment key={key}>{label}</Fragment>; // an unsafe address is shown as plain text
      const external = !href.startsWith('/');
      return <a key={key} href={href} className="font-medium text-primary underline dark:text-primary-tint" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Turns Markdown into blocks: { type: 'h2'|'h3'|'p'|'ul'|'ol', text | items }. Exported for tests. */
export function parseMarkdown(source = '') {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const raw of String(source).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (heading) { flushPara(); flushList(); blocks.push({ type: heading[1].length === 3 ? 'h3' : 'h2', text: heading[2].trim() }); continue; }
    if (bullet || numbered) {
      flushPara();
      const type = bullet ? 'ul' : 'ol';
      if (list && list.type !== type) flushList();
      list = list || { type, items: [] };
      list.items.push((bullet || numbered)[1].trim());
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export default function Markdown({ source, className = '' }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`space-y-4 text-ink dark:text-[#E8F1EB] ${className}`}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        if (b.type === 'h2') return <h2 key={key} className="pt-2 text-xl font-bold text-ink dark:text-white">{inline(b.text, key)}</h2>;
        if (b.type === 'h3') return <h3 key={key} className="pt-1 text-lg font-bold text-ink dark:text-white">{inline(b.text, key)}</h3>;
        if (b.type === 'ul') return <ul key={key} className="space-y-2">{b.items.map((t, j) => <li key={`${key}-${j}`} className="glass-subtle px-5 py-3 text-sm leading-relaxed">{inline(t, `${key}-${j}`)}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={key} className="list-decimal space-y-2 pl-6 text-sm leading-relaxed">{b.items.map((t, j) => <li key={`${key}-${j}`}>{inline(t, `${key}-${j}`)}</li>)}</ol>;
        return <p key={key} className="text-base leading-relaxed">{inline(b.text, key)}</p>;
      })}
    </div>
  );
}