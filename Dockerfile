FROM node:24-alpine AS builder

RUN apk add --no-cache \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build:css

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app /app

EXPOSE 3000

CMD ["npm", "start"]
