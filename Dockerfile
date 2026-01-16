FROM node:24-alpine AS builder

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libsodium-dev

WORKDIR /app

COPY package*.json ./
RUN npm install -g node-gyp
RUN npm_config_build_from_source=true npm ci

COPY . .

RUN npm run build:css

FROM node:24-alpine

RUN apk add --no-cache libsodium

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["npm", "start"]
