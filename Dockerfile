FROM node:20-alpine AS base

FROM base AS builder
RUN apk add --no-cache libc6-compat
RUN apk update
# Set working directory
WORKDIR /app
RUN npm install -g turbo
COPY . .
ARG APP_NAME
RUN turbo prune ${APP_NAME} --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
ARG APP_NAME
RUN npx turbo run build --filter=${APP_NAME}...

FROM base AS runner
WORKDIR /app
ARG APP_NAME
ENV APP_NAME=${APP_NAME}

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Set environment variables for Next.js telemetry and environment
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Automatically leverage output traces to reduce image size
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP_NAME}/public ./apps/${APP_NAME}/public

EXPOSE 3000
ENV PORT 3000

# The standalone build outputs a server.js file
CMD node apps/${APP_NAME}/server.js
