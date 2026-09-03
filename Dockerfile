# syntax=docker/dockerfile:1

# Kaskaadhankija — one container, one SQLite file on a mounted volume.
#
# Debian slim rather than Alpine on purpose: better-sqlite3 ships a prebuilt
# glibc binary (prebuilds/linux-x64.node), so the image needs no compiler and
# the build stays fast. On musl it would fall back to building from source.
#
# Migrations and the sample data run at start-up (src/server/boot.ts), not as a
# release step: the database lives on the volume, and a Fly release machine does
# not have the volume mounted.

# ---------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# The standalone output is assembled by Next's file tracer. Three things it has
# to have picked up, each of which would otherwise only fail at runtime:
#   - the native SQLite binding for this platform,
#   - the migrations, which boot() applies,
#   - the sample datasets, which the seed imports.
# Assert them here, so a tracer change breaks the build instead of production.
RUN test -n "$(find .next/standalone -name 'linux-x64.node' -path '*better-sqlite3*')" \
      || (echo 'better-sqlite3 prebuild missing from .next/standalone' && exit 1)
RUN test -f .next/standalone/drizzle/0001_append_only_triggers.sql \
      || (echo 'migrations missing from .next/standalone' && exit 1)
RUN test -f .next/standalone/seed/naidis-koolituskalender.csv \
      || (echo 'sample datasets missing from .next/standalone' && exit 1)

# ------------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/kaskaadhankija.db

# The standalone server, plus the static assets it serves from disk. There is no
# public/ directory: the icons are app-router assets and are already in the
# build output. Ownership is set during the copy rather than with a later
# `chown -R`, which would duplicate every file into another layer.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# The volume is mounted here; the directory has to exist for a first boot, and
# the unprivileged user has to be able to create the database in it.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3000

# Nothing runs before this: boot() migrates and seeds on the first request path,
# so the container is the only writer and needs no init step.
CMD ["node", "server.js"]
