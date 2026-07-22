# BuildKit cache mounts are used below. Intentionally use the frontend bundled
# with the Docker daemon so builds do not depend on pulling docker/dockerfile.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.7.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN --mount=type=cache,id=hirescope-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
ARG API_ORIGIN=http://api:3001
ARG APP_COMMIT_SHA=development
ARG NODE_MAX_OLD_SPACE_SIZE=1536
ENV API_ORIGIN=$API_ORIGIN
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
COPY . .
RUN --mount=type=cache,id=hirescope-pnpm-store,target=/pnpm/store \
    if [ "$APP_COMMIT_SHA" != "development" ] && ! printf '%s' "$APP_COMMIT_SHA" | grep -Eq '^[0-9a-f]{40}$'; then exit 1; fi \
    && export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" \
    && pnpm db:generate \
    && pnpm --filter @hirescope/shared-types build \
    && pnpm --filter @hirescope/api build \
    && pnpm --filter @hirescope/worker build \
    && pnpm --filter @hirescope/web build

FROM build AS deploy
RUN --mount=type=cache,id=hirescope-pnpm-store,target=/pnpm/store \
    pnpm --filter @hirescope/api deploy --prod --legacy /out/api \
    && pnpm --filter @hirescope/worker deploy --prod --legacy /out/worker \
    && generated_client="$(dirname "$(dirname "$(readlink -f node_modules/@prisma/client)")")/.prisma/client" \
    && api_client="$(dirname "$(dirname "$(readlink -f /out/api/node_modules/@prisma/client)")")/.prisma/client" \
    && worker_client="$(dirname "$(dirname "$(readlink -f /out/worker/node_modules/@prisma/client)")")/.prisma/client" \
    && cp -a "$generated_client/." "$api_client/" \
    && cp -a "$generated_client/." "$worker_client/" \
    && cd /out/api \
    && node -e "if (!require('@prisma/client').TaskStatus) process.exit(1)" \
    && cd /out/worker \
    && node -e "if (!require('@prisma/client').TaskStatus) process.exit(1)"

FROM build AS migrate
ARG APP_COMMIT_SHA=development
ENV NODE_ENV=production
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
LABEL org.opencontainers.image.revision=$APP_COMMIT_SHA
CMD ["/workspace/node_modules/.bin/prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS api
ARG APP_COMMIT_SHA=development
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
LABEL org.opencontainers.image.revision=$APP_COMMIT_SHA
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 hirescope \
    && useradd --system --uid 1001 --gid hirescope --home-dir /app hirescope
COPY --from=deploy --chown=hirescope:hirescope /out/api ./
USER hirescope
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM node:22-bookworm-slim AS worker
ARG APP_COMMIT_SHA=development
ENV NODE_ENV=production
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
LABEL org.opencontainers.image.revision=$APP_COMMIT_SHA
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 hirescope \
    && useradd --system --uid 1001 --gid hirescope --home-dir /app hirescope
COPY --from=deploy --chown=hirescope:hirescope /out/worker ./
USER hirescope
CMD ["node", "dist/main.js"]

FROM node:22-bookworm-slim AS web
ARG APP_COMMIT_SHA=development
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV APP_COMMIT_SHA=$APP_COMMIT_SHA
LABEL org.opencontainers.image.revision=$APP_COMMIT_SHA
WORKDIR /app
RUN groupadd --system --gid 1001 hirescope \
    && useradd --system --uid 1001 --gid hirescope --home-dir /app hirescope
COPY --from=build --chown=hirescope:hirescope /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=hirescope:hirescope /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=hirescope:hirescope /workspace/apps/web/public ./apps/web/public
USER hirescope
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
