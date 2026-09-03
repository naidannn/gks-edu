# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, not from apps/web:
#   docker build -f apps/web/Dockerfile -t gks-web .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# NUXT_PUBLIC_API_BASE is read at runtime by Nitro, so it is not baked in here.
# The web postinstall runs `nuxt prepare`.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @gks/web exec nuxt build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
# The Nitro output is self-contained — it needs no node_modules.
COPY --from=build /repo/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
