# --- deps: install exact dependencies ---------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Match the npm major that wrote package-lock.json (npm 10 rejects its shape).
RUN npm install -g npm@11 && npm ci

# --- build: compile Next.js standalone output --------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- runtime: slim non-root image --------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migrations are applied at boot (instrumentation.ts) from this folder.
COPY --from=build --chown=app:app /app/drizzle ./drizzle

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
