/**
 * The slice of Google Identity Services we actually call. The library is loaded
 * from Google's CDN at runtime (there is no npm package for it), so the global
 * has to be declared by hand.
 *
 * https://developers.google.com/identity/gsi/web/reference/js-reference
 */
export {};

declare global {
  interface GoogleCredentialResponse {
    /** A JWT ID token — this is what `POST /auth/google` verifies. */
    credential: string;
    select_by: string;
  }

  interface GoogleButtonOptions {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'small' | 'medium' | 'large';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    logo_alignment?: 'left' | 'center';
    /** Pixels. Google caps it at 400. */
    width?: number;
    locale?: string;
  }

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            ux_mode?: 'popup' | 'redirect';
          }): void;
          renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}
