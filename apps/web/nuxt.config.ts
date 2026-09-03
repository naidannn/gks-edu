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
