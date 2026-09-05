#!/usr/bin/env bash
# Builds both apps on this machine and stages the artefacts in .deploy-build/.
#
# Building locally is deliberate: the server has 1.9 GB of RAM shared with ten
# other applications, and a Nuxt build there would swap hard enough to hurt
# them. Only compiled output is shipped.
#
#   .deploy-build/api/   dist/ + prisma/ + assets/ + the manifests pnpm needs
#   .deploy-build/web/   Nuxt .output/ — self-contained, no node_modules needed

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

ENV_FILE="$DEPLOY_DIR/.env.production"
[[ -f "$ENV_FILE" ]] || die "deploy/.env.production not found — run ./deploy/init-env.sh first"

cd "$REPO_ROOT"

log "Cleaning $BUILD_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/api" "$BUILD_DIR/web"

# --------------------------------------------------------------------- API
log "Generating Prisma client"
pnpm --filter @gks/api exec prisma generate >/dev/null

log "Building the API (nest build)"
pnpm --filter @gks/api build

[[ -d apps/api/dist ]] || die "apps/api/dist was not produced"

log "Staging API artefacts"
cp -R apps/api/dist                "$BUILD_DIR/api/dist"
cp -R apps/api/prisma              "$BUILD_DIR/api/prisma"
# The contract PDF reads its font and letterhead from `assets/` relative to the
# working directory, so they ship beside dist/ rather than inside it.
cp -R apps/api/assets              "$BUILD_DIR/api/assets"
cp    apps/api/package.json        "$BUILD_DIR/api/package.json"
cp    apps/api/prisma.config.ts    "$BUILD_DIR/api/prisma.config.ts"
# `prisma generate` runs as apps/api's postinstall; the server installs with
# --ignore-scripts because the client is already compiled into dist/, but the
# schema still ships so `prisma migrate` has something to read.

# pnpm resolves production dependencies on the server from the workspace
# lockfile, which is the only way to get Linux-correct binaries out of a macOS
# build. These manifests are what it needs to do that.
mkdir -p "$BUILD_DIR/api/_workspace/apps/api" \
         "$BUILD_DIR/api/_workspace/apps/web" \
         "$BUILD_DIR/api/_workspace/packages/shared"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml "$BUILD_DIR/api/_workspace/"
cp apps/api/package.json          "$BUILD_DIR/api/_workspace/apps/api/"
cp apps/web/package.json          "$BUILD_DIR/api/_workspace/apps/web/"
cp packages/shared/package.json   "$BUILD_DIR/api/_workspace/packages/shared/"

ok "API staged ($(du -sh "$BUILD_DIR/api" | cut -f1))"

# --------------------------------------------------------------------- WEB
log "Building the web (nuxt build, production env)"
(
  cd apps/web
  # The package script hardcodes the development .env, so call nuxt directly
  # with the production one. Nuxt reads runtimeConfig.public at build time and
  # again from NUXT_PUBLIC_* at runtime; setting it in both places keeps the
  # generated payload and the running server in agreement.
  NODE_ENV=production pnpm exec nuxt build --dotenv "$ENV_FILE"
)

[[ -d apps/web/.output ]] || die "apps/web/.output was not produced"

log "Staging web artefacts"
cp -R apps/web/.output "$BUILD_DIR/web/.output"

ok "Web staged ($(du -sh "$BUILD_DIR/web" | cut -f1))"
ok "Build complete — run ./deploy/deploy.sh to ship it"
