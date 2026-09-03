# syntax=docker/dockerfile:1
#
# Build from the REPO ROOT, not from apps/api:
#   docker build -f apps/api/Dockerfile -t gks-api .

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
# The api postinstall runs `prisma generate`, so no separate step is needed.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @gks/api build \
 && pnpm --filter @gks/api --prod --legacy deploy /prod/api

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /prod/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
# Migrations ship with the image so `prisma migrate deploy` can run on release.
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
