/**
 * Extra `definePageMeta` keys this app understands.
 *
 * `flush` exists for one kind of screen: the ones that are an application
 * rather than a document. The portal shell centres pages in a reading-width
 * column with generous padding, which is right for a dashboard and wrong for
 * a messenger — a chat wants the full height of the viewport and its own
 * scroll region. A layout modifier keeps that decision on the page that needs
 * it instead of scattering `calc(100vh - …)` through its stylesheet.
 */
export {};

declare module '#app' {
  interface PageMeta {
    /** Drop the shell's padding and reading-width column; fill the viewport. */
    flush?: boolean;
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    flush?: boolean;
  }
}
