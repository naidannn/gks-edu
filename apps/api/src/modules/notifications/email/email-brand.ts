/**
 * Brand constants for outgoing mail.
 *
 * The palette is the one in `apps/web/app/assets/css/tokens.css`, copied rather
 * than imported: the API cannot read the web app's CSS, and an email's colours
 * have to be literal hex anyway — no client resolves `var()`. When the design
 * tokens move, move these with them.
 */

export const EMAIL_COLORS = {
  /** Page behind the card. */
  canvas: '#f4f6f8',
  canvasDark: '#0d1116',

  surface: '#ffffff',
  surfaceDark: '#141a21',
  surfaceMuted: '#f6faff',
  surfaceMutedDark: '#1b222a',

  border: '#dce1e7',
  borderDark: '#28323d',

  ink: '#141a21',
  textStrong: '#141a21',
  textStrongDark: '#f4f6f8',
  textBody: '#28313a',
  textBodyDark: '#c3cbd4',
  textMuted: '#5a6673',
  textMutedDark: '#9ba6b2',

  brand: '#2563eb',
  brandDark: '#3b82f6',
  red: '#c3262d',
  green: '#1b8149',
  amber: '#b37400',
} as const;

/**
 * The accent stripe and the eyebrow badge take their colour from the tone, so
 * "виз татгалзсан" and "төлбөр баталгаажлаа" never look like the same message
 * at a glance.
 */
export const EMAIL_TONES = {
  info: { accent: EMAIL_COLORS.brand, tint: '#eff6ff', tintDark: '#16243d', text: '#1d4ed8' },
  success: { accent: EMAIL_COLORS.green, tint: '#edf7f1', tintDark: '#122a1f', text: '#14663c' },
  warning: { accent: EMAIL_COLORS.amber, tint: '#fdf7e8', tintDark: '#2b2312', text: '#8a5a00' },
  critical: { accent: EMAIL_COLORS.red, tint: '#fdf2f2', tintDark: '#2e1618', text: '#9a1e24' },
} as const;

export type EmailTone = keyof typeof EMAIL_TONES;

/** System stack — no webfont survives Outlook, and Cyrillic is covered everywhere. */
export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans',sans-serif";

/** Tabular figures for amounts, dates and case codes. */
export const EMAIL_FONT_MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

export const EMAIL_BRAND = {
  name: 'GKS EDU GROUP',
  legalName: '«Жи Кэй Эс Эдү Групп» ХХК',
  tagline: 'Солонгост суралцах зуучлалын платформ',
  address: 'Улаанбаатар, Төв шуудангийн урд талд, Eco International Tower, 17 давхар, 1707 тоот',
  phone: '7710-9000',
  phoneHref: 'tel:+97677109000',
  /** `/img/brand/*` is served by the Nuxt app, so the URL is `appUrl` + this.
   *  The knockout mark, cropped away from the strapline that is unreadable at
   *  email size, and exported at 2× for retina. */
  logoPath: '/img/brand/gks-logo-knockout.png',
  logoWidth: 132,
  logoHeight: 51,
} as const;
