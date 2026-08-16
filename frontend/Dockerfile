FROM oven/bun:1 AS base

# Install dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bunx --bun vinxi build

# Production
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=base /app/.output ./.output
COPY --from=base /app/node_modules ./node_modules

EXPOSE 3000
# CMD ["bun", "run", "start"]
CMD ["bunx", "--bun", "vinxi" "start",]
