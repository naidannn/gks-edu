// PM2 process definitions for GKSedu.mn.
//
// This file is copied to /var/www/gks-edu/ecosystem.config.cjs. PM2 itself runs
// on the host's node 18, so keep this file CommonJS and ES2020-plain — the apps
// it launches run under node 22 via `interpreter`.
//
// Ten other applications share this PM2 daemon. Every name here is prefixed
// `gksedu-` and every command in deploy/ targets those names only, so nothing
// here can restart somebody else's process.

const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = '/var/www/gks-edu';
// The system node is v18, which neither Nest 12 nor Nuxt 4 supports. The other
// apps on this box run on that v18, so we point at nvm's 22 rather than
// changing what /usr/bin/node means for everyone.
const NODE_22 = '/home/ubuntu/.nvm/versions/node/v22.22.2/bin/node';

/** Minimal .env reader — enough for KEY=VALUE with optional quotes and #comments. */
function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = readEnv(path.join(APP_DIR, '.env'));

module.exports = {
  apps: [
    {
      name: 'gksedu-api',
      cwd: path.join(APP_DIR, 'api'),
      script: 'dist/main.js',
      interpreter: NODE_22,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // 1.9 GB box: bail out rather than let a leak take the other apps with
      // us. Nest + the Prisma client settle around 260 MB, so this is headroom
      // for a real leak, not a limit normal traffic will brush against.
      max_memory_restart: '450M',
      // Nest boots Prisma, Redis and BullMQ before it listens; give it room.
      kill_timeout: 8000,
      env: { ...env, NODE_ENV: 'production' },
      out_file: path.join(APP_DIR, 'logs/api.out.log'),
      error_file: path.join(APP_DIR, 'logs/api.err.log'),
      merge_logs: true,
      time: true,
    },
    {
      name: 'gksedu-front',
      cwd: path.join(APP_DIR, 'web'),
      script: '.output/server/index.mjs',
      interpreter: NODE_22,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        ...env,
        NODE_ENV: 'production',
        // Nitro listens on PORT; NUXT_PUBLIC_* come from .env above and
        // override the defaults compiled into nuxt.config.ts.
        HOST: '127.0.0.1',
        PORT: env.WEB_PORT || '3010',
        NITRO_PORT: env.WEB_PORT || '3010',
      },
      out_file: path.join(APP_DIR, 'logs/web.out.log'),
      error_file: path.join(APP_DIR, 'logs/web.err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
