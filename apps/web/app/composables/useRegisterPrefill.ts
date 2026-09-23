/**
 * What a visitor already typed on the consultation form, carried to `/register`
 * so they are not asked for their name and address a second time.
 *
 * Kept in Nuxt state rather than the query string on purpose: a URL with an
 * e-mail address in it is logged by the pixel, the browser history and every
 * analytics tool on the way — state survives the client-side hop and nothing else.
 */
export interface RegisterPrefill {
  name: string;
  email: string;
}

export const useRegisterPrefill = () => useState<RegisterPrefill | null>('register-prefill', () => null);
