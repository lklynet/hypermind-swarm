FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build:css

RUN npm ci --omit=dev \
    && node -e "require('rocksdb-native')"

FROM node:24-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libatomic1 \
    libsodium23 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY --from=builder --chown=node:node /app /app

RUN chmod 0755 /app/docker-entrypoint.sh \
    && mkdir -p /app/storage \
    && chown node:node /app/storage

RUN setpriv --reuid=node --regid=node --init-groups \
    node -e "require('rocksdb-native')"

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
