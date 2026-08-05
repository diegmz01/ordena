# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f apps/api/Dockerfile -t ordena-api .

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV NODE_ENV=production
ENV API_PORT=4000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --filter @ordena/api...
RUN pnpm --filter @ordena/database generate

EXPOSE 4000

# Migrations: run as Railway release command → pnpm db:migrate:deploy
CMD ["pnpm", "--filter", "@ordena/api", "start"]
