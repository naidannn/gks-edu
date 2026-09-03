// Prisma 7 CLI configuration. Connection URLs live here rather than in
// schema.prisma; the running app gets its connection from the driver adapter
// in `src/prisma/prisma.service.ts`.
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The workspace keeps one .env at the repo root; a package-local .env wins.
loadEnv({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma spawns this without a shell, so go through pnpm to find the binary.
    seed: 'pnpm exec tsx prisma/seed.ts',
  },
  datasource: {
    // Read straight from process.env rather than prisma/config's `env()` helper:
    // `env()` throws on an unset variable, which would break `prisma generate`
    // in a Docker build stage that has no database credentials.
    //
    // Transaction-mode pooler — fine for `prisma db pull` / `studio`.
    url: process.env.DATABASE_URL,
    // Session-mode/direct connection. Migrate needs it: PgBouncer in
    // transaction mode cannot hold the advisory locks that DDL requires.
    directUrl: process.env.DIRECT_URL,
  },
});
