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
      ],
    },
  },
});
