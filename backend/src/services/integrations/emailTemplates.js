'use strict';
// The look of the platform's emails (P8-09): one simple, readable layout, sent together with a plain-text version so it still
// works in a client that shows no HTML. Every piece of text is escaped here, so a person's name or a message can never inject
// markup, and the one link is checked to be http(s) before it is used as a button.
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : null);

/**
 * @param {{ title: string, greeting?: string, paragraphs?: string[], button?: { label: string, url: string }, footer?: string }} content
 * @returns {{ html: string, text: string }}
 */
function renderEmail({ title, greeting, paragraphs = [], button, footer }) {
  const url = button ? safeUrl(button.url) : null;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f7f4;font-family:Arial,Helvetica,sans-serif;color:#17251d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7f4;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;">
<tr><td style="font-size:14px;font-weight:bold;color:#047857;letter-spacing:.04em;">E-WASTE NETWORK</td></tr>
<tr><td style="font-size:22px;font-weight:bold;padding:12px 0 8px;">${escapeHtml(title)}</td></tr>
${greeting ? `<tr><td style="font-size:16px;line-height:1.5;padding:4px 0;">${escapeHtml(greeting)}</td></tr>` : ''}
${paragraphs.map((p) => `<tr><td style="font-size:16px;line-height:1.5;padding:6px 0;">${escapeHtml(p)}</td></tr>`).join('\n')}
${url ? `<tr><td style="padding:20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;">${escapeHtml(button.label)}</a></td></tr>
<tr><td style="font-size:13px;color:#52645a;line-height:1.4;">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all;">${escapeHtml(url)}</span></td></tr>` : ''}
${footer ? `<tr><td style="font-size:13px;color:#52645a;line-height:1.4;padding-top:20px;">${escapeHtml(footer)}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
  const text = [greeting, ...paragraphs, url ? `${button.label}:\n${url}` : null, footer].filter(Boolean).join('\n\n');
  return { html, text };
}

module.exports = { renderEmail, escapeHtml };