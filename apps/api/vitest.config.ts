import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    root: './',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/generated/**', 'src/main.ts', '**/*.module.ts'],
    },
  },
  // NestJS relies on emitDecoratorMetadata, which esbuild (Vite's default) cannot emit.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
