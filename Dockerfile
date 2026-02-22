FROM oven/bun:latest AS base
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Application ---
FROM base
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
COPY tsconfig.json ./

VOLUME /app/data
EXPOSE 3000

CMD ["bun", "run", "src/server/index.ts"]
