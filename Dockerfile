# Angular SSR application (server bundle is self-contained: no node_modules at runtime)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 angular

COPY --from=build --chown=angular:nodejs /app/dist/Taxered ./dist/Taxered

USER angular

EXPOSE 3000

CMD ["node", "dist/Taxered/server/server.mjs"]
