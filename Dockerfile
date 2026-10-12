# syntax=docker/dockerfile:1

# --- build: install deps and bundle server + client with esbuild ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skip husky's prepare hook; no git repo in the image.
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY application ./application
COPY caching-fetch-library ./caching-fetch-library
COPY framework ./framework
RUN npm run build

# --- runtime: esbuild bundles all dependencies, so only dist/ is needed ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
