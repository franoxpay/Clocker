FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 80

CMD ["node", "dist/index.cjs"]
