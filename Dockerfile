# Build stage: compile native addons (better-sqlite3)
FROM node:24-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage: slim image with pre-built node_modules
FROM node:24-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY server/ ./server/
COPY public/ ./public/
COPY src/ ./src/
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
