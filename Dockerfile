FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y \
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

FROM node:24-slim

RUN apt-get update && apt-get install -y \
    libsodium23 \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app /app

RUN npm rebuild

EXPOSE 3000

CMD ["npm", "start"]
