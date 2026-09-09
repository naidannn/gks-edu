/**
 * The one HTML layout every outgoing email uses.
 *
 * Constraints that shaped it, in order of how much they cost:
 *  - Outlook renders with Word, so the frame is `<table>`s, the button has a
 *    VML twin, and nothing depends on flexbox, grid or `border-radius`.
 *  - Gmail strips `<link>`, keeps a single `<style>` in `<head>`, and drops
 *    classes on nothing — so colours are inline (they must survive the strip)
 *    and the `<style>` block only carries the dark-mode and small-screen
 *    overrides, which are enhancements.
 *  - Images are blocked by default in most clients, so the logo is decoration
 *    on a band that is already the brand colour, never the message itself.
 */

import { EMAIL_BRAND, EMAIL_COLORS as C, EMAIL_FONT, EMAIL_FONT_MONO, EMAIL_TONES, type EmailTone } from './email-brand.js';
import { escapeHtml, parseEmailBody, toPlainText, type EmailBlock } from './email-content.js';

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailCode {
  /** The six digits themselves. */
  value: string;
  /** One line under them — how long they last, usually. */
  note?: string;
}

export interface EmailMessage {
  subject: string;
  /** Big line inside the card. Defaults to the subject. */
  heading?: string;
  /** Small category label above the heading — "Төлбөр", "Виз", … */
  eyebrow?: string;
  tone?: EmailTone;
  /** Plain-text body; see `parseEmailBody` for the shapes it understands. */
  body: string;
  /** Overrides the link found in the body. `null` suppresses the button. */
  cta?: EmailCta | null;
  /**
   * A one-time code, set apart from the prose. It is the whole point of the
   * mails that carry one, so it is rendered large and monospaced under the
   * body — where the button would otherwise be — and repeated in the text
   * part on its own line, so a code is never lost to a client that strips
   * HTML.
   */
  code?: EmailCode;
  /** One line under the divider — why this email arrived, what to do next. */
  footerNote?: string;
  /** Inbox preview line. Defaults to the first sentence of the body. */
  preheader?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const WIDTH = 600;

export function renderEmail(message: EmailMessage, appUrl: string): RenderedEmail {
  const base = appUrl.replace(/\/$/, '');
  const tone = EMAIL_TONES[message.tone ?? 'info'];
  const parsed = parseEmailBody(message.body);

  const cta =
    message.cta === null
      ? null
      : (message.cta ?? (parsed.url ? { label: 'Дэлгэрэнгүй харах', url: parsed.url } : null));

  const heading = message.heading ?? message.subject;
  const preheader = message.preheader ?? firstSentence(parsed.blocks) ?? heading;

  const html = [
    '<!doctype html>',
    '<html lang="mn" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
    head(message.subject),
    `<body style="margin:0;padding:0;width:100%;background-color:${C.canvas};-webkit-font-smoothing:antialiased" class="gks-canvas">`,
    hiddenPreheader(preheader),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.canvas}" class="gks-canvas">`,
    '<tr><td align="center" style="padding:24px 12px 40px">',
    `<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" class="gks-card" style="width:${WIDTH}px;max-width:100%;background-color:${C.surface};border:1px solid ${C.border};border-radius:16px;overflow:hidden">`,
    header(base),
    `<tr><td style="height:4px;line-height:4px;font-size:0;background-color:${tone.accent}">&nbsp;</td></tr>`,
    '<tr><td class="gks-pad" style="padding:32px 36px 8px">',
    message.eyebrow ? eyebrow(message.eyebrow, message.tone ?? 'info') : '',
    `<h1 class="gks-h1" style="margin:0 0 20px;font-family:${EMAIL_FONT};font-size:23px;line-height:1.32;font-weight:700;color:${C.textStrong};letter-spacing:-0.01em">${escapeHtml(heading)}</h1>`,
    parsed.blocks.map((block) => renderBlock(block, message.tone ?? 'info')).join(''),
    message.code ? codePanel(message.code, message.tone ?? 'info') : '',
    cta ? button(cta) : '',
    cta ? fallbackLink(cta.url) : '',
    '</td></tr>',
    footer(base, message.footerNote),
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('\n');

  return { html, text: plainText(message, parsed.url, cta) };
}

// ── Frame ──────────────────────────────────────────────────────────────────

function head(subject: string): string {
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  a { text-decoration: none; }
  img { border: 0; outline: none; -ms-interpolation-mode: bicubic; }
  @media only screen and (max-width: 620px) {
    .gks-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .gks-h1 { font-size: 21px !important; }
    .gks-btn { display: block !important; width: 100% !important; }
  }
  @media (prefers-color-scheme: dark) {
    .gks-canvas { background-color: ${C.canvasDark} !important; }
    .gks-card { background-color: ${C.surfaceDark} !important; border-color: ${C.borderDark} !important; }
    .gks-h1, .gks-strong { color: ${C.textStrongDark} !important; }
    .gks-text { color: ${C.textBodyDark} !important; }
    .gks-muted { color: ${C.textMutedDark} !important; }
    .gks-panel { background-color: ${C.surfaceMutedDark} !important; border-color: ${C.borderDark} !important; }
    .gks-footer { background-color: ${C.canvasDark} !important; border-color: ${C.borderDark} !important; }
    .gks-rule { border-color: ${C.borderDark} !important; }
  }
</style>
</head>`;
}

/** Gmail shows this instead of the first words of the body — then the padding
 *  characters stop it from spilling the rest of the message into the preview. */
function hiddenPreheader(text: string): string {
  const pad = '&#847;&zwnj;&nbsp;'.repeat(60);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};opacity:0">${escapeHtml(text)}${pad}</div>`;
}

function header(base: string): string {
  return `<tr><td style="background-color:${C.ink};padding:22px 36px" class="gks-pad">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle">
<img src="${base}${EMAIL_BRAND.logoPath}" width="${EMAIL_BRAND.logoWidth}" height="${EMAIL_BRAND.logoHeight}" alt="${EMAIL_BRAND.name}" style="display:block;width:${EMAIL_BRAND.logoWidth}px;height:auto">
</td></tr><tr><td style="padding-top:8px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.4;color:#9ba6b2;letter-spacing:0.02em">${EMAIL_BRAND.tagline}</td></tr>
</table></td></tr>`;
}

function footer(base: string, note?: string): string {
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:${C.textMuted};text-decoration:underline" class="gks-muted">${escapeHtml(label)}</a>`;

  return `<tr><td class="gks-pad gks-footer" style="padding:26px 36px 30px;background-color:${C.canvas};border-top:1px solid ${C.border}">
${note ? `<p class="gks-muted" style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:13px;line-height:1.6;color:${C.textMuted}">${escapeHtml(note)}</p>` : ''}
<p class="gks-strong" style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:13px;font-weight:600;color:${C.textStrong}">${escapeHtml(EMAIL_BRAND.legalName)}</p>
<p class="gks-muted" style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:${C.textMuted}">${escapeHtml(EMAIL_BRAND.address)}<br>
<a href="${EMAIL_BRAND.phoneHref}" style="color:${C.textMuted};text-decoration:none;font-family:${EMAIL_FONT_MONO}" class="gks-muted">${EMAIL_BRAND.phone}</a> · ${link(base, 'gksedu.mn')}</p>
<p class="gks-muted" style="margin:0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${C.textMuted}">
Энэ мэдэгдлийг GKSedu.mn системээс автоматаар илгээв. ${link(`${base}/app/profile`, 'Мэдэгдлийн тохиргоо')}
</p></td></tr>`;
}

// ── Body blocks ────────────────────────────────────────────────────────────

function renderBlock(block: EmailBlock, tone: EmailTone): string {
  switch (block.kind) {
    case 'paragraph':
      return `<p class="gks-text" style="margin:0 0 16px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;color:${C.textBody}">${block.lines
        .map((line) => escapeHtml(line))
        .join('<br>')}</p>`;

    case 'facts':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gks-panel" style="margin:0 0 20px;background-color:${C.surfaceMuted};border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:6px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${block.rows
  .map(
    (row, index) => `<tr>
<td style="padding:10px 12px 10px 0;${index ? `border-top:1px solid ${C.border};` : ''}font-family:${EMAIL_FONT};font-size:13px;line-height:1.5;color:${C.textMuted};white-space:nowrap" class="gks-muted gks-rule">${escapeHtml(row.label)}</td>
<td align="right" style="padding:10px 0;${index ? `border-top:1px solid ${C.border};` : ''}font-family:${EMAIL_FONT};font-size:14px;line-height:1.5;font-weight:600;color:${C.textStrong}" class="gks-strong gks-rule">${escapeHtml(row.value)}</td>
</tr>`,
  )
  .join('')}
</table></td></tr></table>`;

    case 'list':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
${block.items
  .map(
    (item) => `<tr>
<td width="18" style="vertical-align:top;padding:0 0 8px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;color:${EMAIL_TONES[tone].accent}">•</td>
<td style="padding:0 0 8px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.65;color:${C.textBody}" class="gks-text">${escapeHtml(item)}</td>
</tr>`,
  )
  .join('')}
</table>`;
  }
}

/**
 * The code, big enough to read off a phone held next to a laptop. Letter
 * spacing rather than per-digit boxes: boxes are a `<table>` per digit in
 * Outlook, and they break the moment somebody tries to select the code to
 * copy it.
 */
function codePanel(code: EmailCode, tone: EmailTone): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gks-panel" style="margin:4px 0 20px;background-color:${C.surfaceMuted};border:1px solid ${C.border};border-radius:12px">
<tr><td align="center" style="padding:22px 18px 18px">
<div class="gks-strong" style="font-family:${EMAIL_FONT_MONO};font-size:34px;line-height:1.15;font-weight:700;letter-spacing:0.22em;text-indent:0.11em;color:${EMAIL_TONES[tone].accent}">${escapeHtml(code.value)}</div>
${code.note ? `<div class="gks-muted" style="padding-top:10px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${C.textMuted}">${escapeHtml(code.note)}</div>` : ''}
</td></tr></table>`;
}

function eyebrow(label: string, tone: EmailTone): string {
  const { tint, text } = EMAIL_TONES[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px"><tr>
<td style="background-color:${tint};border-radius:999px;padding:5px 12px;font-family:${EMAIL_FONT};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${text}">${escapeHtml(label)}</td>
</tr></table>`;
}

function button(cta: EmailCta): string {
  const href = escapeHtml(cta.url);
  const label = escapeHtml(cta.label);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr><td>
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:260px" arcsize="25%" stroke="f" fillcolor="${C.brand}">
<w:anchorlock/><center style="color:#ffffff;font-family:${EMAIL_FONT};font-size:15px;font-weight:600">${label}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${href}" class="gks-btn" style="display:inline-block;background-color:${C.brand};color:#ffffff;font-family:${EMAIL_FONT};font-size:15px;font-weight:600;line-height:1;padding:16px 30px;border-radius:12px;text-align:center;text-decoration:none">${label}</a>
<!--<![endif]-->
</td></tr></table>`;
}

/** Some corporate clients rewrite or eat the button; the raw URL is the escape hatch. */
function fallbackLink(url: string): string {
  return `<p class="gks-muted" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:${C.textMuted};word-break:break-all">
Товч ажиллахгүй бол энэ хаягийг хөтчид хуулна уу:<br><span style="font-family:${EMAIL_FONT_MONO}">${escapeHtml(url)}</span></p>`;
}

// ── Text alternative ───────────────────────────────────────────────────────

function plainText(message: EmailMessage, bodyUrl: string | null, cta: EmailCta | null): string {
  const url = cta?.url ?? bodyUrl;
  // Indented and on its own line, the way the HTML sets the panel apart, and
  // above the link for the same reason the panel sits above the button.
  const code = message.code
    ? `\n\n    ${message.code.value}${message.code.note ? `\n    ${message.code.note}` : ''}`
    : '';
  const body = toPlainText(`${message.body.trimEnd()}${code}`, url, cta?.label);
  // The footer note is where "do not pass this code on" lives, so it belongs
  // in the part a text-only client shows too.
  const note = message.footerNote ? ['', message.footerNote] : [];
  return [body, ...note, '', '—', EMAIL_BRAND.legalName, `${EMAIL_BRAND.phone} · gksedu.mn`].join('\n');
}

function firstSentence(blocks: EmailBlock[]): string | null {
  for (const block of blocks) {
    if (block.kind !== 'paragraph') continue;
    const line = block.lines.find((candidate) => candidate.length > 12 && !/^Сайн байна уу/.test(candidate));
    if (line) return line.slice(0, 140);
  }
  return null;
}
