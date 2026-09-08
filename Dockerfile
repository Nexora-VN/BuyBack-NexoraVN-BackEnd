FROM node:24-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10

FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN pnpm run prisma:generate \
  && pnpm run build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/prisma.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "dist/main.js"]
