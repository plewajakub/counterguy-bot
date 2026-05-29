FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./

# sqlite3 requires native build tooling on Debian slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Avoid pulling a prebuilt sqlite3 binary that can mismatch GLIBC.
# Build native deps from source inside the image.
ENV npm_config_build_from_source=true
RUN --mount=type=cache,target=/root/.npm npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build


FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Default location for SQLite DB (should be a mounted volume)
ENV DB_FILE=/data/voice_data.db

CMD ["node", "dist/index.js"]
