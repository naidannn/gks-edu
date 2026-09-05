const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** One shared load across every component that asks for it. */
let loading: Promise<void> | null = null;

/**
 * Injects Google's Identity Services script and resolves once `window.google`
 * is usable. Rejects if the script cannot be fetched — the caller is expected
 * to fall back to the email/password form rather than block on it.
 */
export function loadGoogleIdentityServices(): Promise<void> {
  if (import.meta.server) return Promise.reject(new Error('GSI is browser-only'));
  if (window.google?.accounts?.id) return Promise.resolve();

  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error('GSI loaded without accounts.id'));
    };
    script.onerror = () => {
      // Let a later attempt retry instead of caching the failure forever.
      loading = null;
      reject(new Error('GSI script failed to load'));
    };
    document.head.appendChild(script);
  });

  return loading;
}
