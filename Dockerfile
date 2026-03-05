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
COPY bunfig.toml ./
COPY src ./src
COPY fonts ./fonts
COPY icons ./icons
COPY tsconfig.json ./

ENV PROSEUS_DATA_DIR=/app/data

VOLUME /app/data
EXPOSE 8075

CMD ["bun", "run", "src/server/index.ts", "--lan"]
