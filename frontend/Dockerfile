# ======================================================
# Stage 1 - Install Dependencies
# ======================================================

FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# ======================================================
# Stage 2 - Build Next.js Application
# ======================================================

FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ======================================================
# Stage 3 - Production Runtime
# ======================================================

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/.next ./.next

COPY --from=builder /app/public ./public

COPY --from=builder /app/next.config.mjs ./next.config.mjs

COPY --from=builder /app/jsconfig.json ./jsconfig.json

EXPOSE 3000

CMD ["npm", "start"]