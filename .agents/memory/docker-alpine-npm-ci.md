---
name: Docker Alpine npm ci crash
description: npm ci fails with "Exit handler never called!" on node:20-alpine in EasyPanel builds; root cause and Dockerfile fix.
---

## The Rule
Always use `node:20-slim` (Debian/glibc) as the builder stage — never `node:20-alpine` — when the project has native binary packages like esbuild.

**Why:** `esbuild ^0.25` (and similar packages with postinstall binary downloads) crash `npm ci` silently on musl/Alpine: the process exits 0 but node_modules is incomplete. tsx ends up missing → build fails with "sh: tsx: not found". The error signature is "Exit handler never called!" after ~145s in both builder and runner Docker layers.

**How to apply:**
- Builder: `FROM node:20-slim AS builder` + `RUN npm ci`
- Runner: `FROM node:20-alpine AS runner` + `COPY --from=builder /app/node_modules ./node_modules` + `RUN npm prune --omit=dev`
- Never run `npm ci --omit=dev` on Alpine in EasyPanel — it will also crash for similar reasons on production deps.
- `npm prune --omit=dev` (on already-installed node_modules copied from builder) is safe on Alpine because it only deletes files, no downloads.
