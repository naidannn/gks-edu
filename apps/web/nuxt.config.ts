import tailwindcss from '@tailwindcss/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    // Server-only secrets go here (overridden by NUXT_* env vars).
    public: {
      // NUXT_PUBLIC_API_BASE
      apiBase: 'http://localhost:3001/api/v1',
      // NUXT_PUBLIC_SITE_URL — canonical origin for sitemap.xml/robots.txt (1A-19).
      siteUrl: 'https://gksedu.mn',
      // NUXT_PUBLIC_GA_ID — GA4 measurement id ("G-XXXXXXX"). Unset = no analytics script loads (1A-21).
      gaId: '',
      // NUXT_PUBLIC_GOOGLE_CLIENT_ID — OAuth 2.0 Web client id. Unset = no "Google-ээр
      // нэвтрэх" button; it must match GOOGLE_CLIENT_ID on the API side.
      googleClientId: '',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    typedPages: true,
  },

  app: {
    head: {
      titleTemplate: '%s · GKS Edu',
      htmlAttrs: { lang: 'mn' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        // The Android address bar and the PWA splash; matches --brand-950.
        { name: 'theme-color', content: '#0f1f4a' },
      ],
      link: [
        // Google renders the favicon beside the domain in every mobile result,
        // and asks for 48px or a multiple of it — `favicon.ico` carries 16/32/48.
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', type: 'image/png', href: '/icon-192.png', sizes: '192x192' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        // Webfonts: linked here rather than @import-ed from main.css, so the
        // stylesheet and the app CSS download in parallel (see main.css).
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href:
            'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800;900' +
            '&family=IBM+Plex+Mono:wght@400;500;600' +
            '&family=Noto+Sans+KR:wght@400;500;700;900&display=swap',
        },
      ],
    },
  },
});
