# Product-testing pass, 2026-08-28, gap #7: this project has never had
# any container/deployment artifact — every prior "verified live" claim
# in progress.md was against a manually-started dev process on this one
# machine. Built and tested against the same 24.x Node this project has
# been developed on throughout (confirmed via `node --version`, not
# assumed), matching this codebase's own "verify empirically" standard.
#
# Multi-stage: build with full devDependencies (tsx/vitest/eslint/the
# `prisma` CLI), then prune down to a lean runtime image. Everything
# hoists to the monorepo ROOT node_modules under npm workspaces
# (confirmed by inspecting the actual installed tree, not assumed) — the
# generated Prisma client (`node_modules/.prisma`, `node_modules/@prisma/client`)
# lives there, not under apps/SureStock-backend/node_modules, which is
# why every COPY below is rooted at /app, not /app/apps/SureStock-backend.
#
# No native query-engine binary to worry about cross-compiling for the
# runtime image's platform — this project already runs Prisma 7's
# no-rust-engine client via @prisma/adapter-mariadb (see schema.prisma's
# own header comment), so there's nothing here a traditional
# Prisma+Docker setup would normally need a `binaryTargets` entry for.

FROM node:24-slim AS build
WORKDIR /app

# Root lockfile + just this workspace's package.json first — maximizes
# layer caching, so an ordinary source-only change never invalidates the
# (slow) npm ci layer.
COPY package.json package-lock.json ./
COPY apps/SureStock-backend/package.json apps/SureStock-backend/package.json
RUN npm ci

COPY apps/SureStock-backend apps/SureStock-backend
WORKDIR /app/apps/SureStock-backend

# prisma.config.ts loads MIGRATE_DATABASE_URL just to resolve its own
# config object — even for `generate`, which never actually connects to
# a database. A placeholder is fine here; the real value is supplied by
# the container's actual environment whenever `prisma migrate deploy`
# is genuinely run (see this repo's docker-compose.yml `migrate` service).
ENV MIGRATE_DATABASE_URL="mysql://placeholder:placeholder@localhost:3306/placeholder"
RUN npx prisma generate
RUN npm run build

# `build` (above) is deliberately left with devDependencies intact —
# docker-compose.yml's `backend-test` service targets this exact stage
# (`--target build`) to run the real test suite (vitest, the `prisma`
# CLI for `migrate deploy`) against a real containerized MariaDB. The
# prune happens in its own stage instead of as build's last step, so
# targeting `build` genuinely gets the un-pruned image, not a stage that
# only looks unpruned until Docker resolves the rest of its own definition.
FROM build AS prod-deps
WORKDIR /app
# The already-generated Prisma client output is a real dependency, not a
# devDependency, so pruning here doesn't touch it (confirmed: pruning
# removes packages, not generated files already written to disk).
RUN npm prune --omit=dev

FROM node:24-slim AS runtime
# Never run as root in the container — same "least privilege" reasoning
# this project already applies to the database user itself (T-02).
RUN groupadd --system surestock && useradd --system --gid surestock --home /app surestock
WORKDIR /app

COPY --from=prod-deps --chown=surestock:surestock /app/node_modules ./node_modules
COPY --from=build --chown=surestock:surestock /app/apps/SureStock-backend/dist ./apps/SureStock-backend/dist
COPY --from=build --chown=surestock:surestock /app/apps/SureStock-backend/prisma ./apps/SureStock-backend/prisma
COPY --from=build --chown=surestock:surestock /app/apps/SureStock-backend/package.json ./apps/SureStock-backend/package.json

WORKDIR /app/apps/SureStock-backend
USER surestock
ENV NODE_ENV=production
EXPOSE 4000

# server.ts already binds 0.0.0.0 (not Fastify's 127.0.0.1 default) and
# handles SIGINT/SIGTERM for a graceful shutdown — confirmed by reading
# it, not assumed; both are exactly what a container needs and neither
# needed changing to make this image work.
CMD ["node", "dist/server.js"]
