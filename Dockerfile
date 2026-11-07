# OCEAN CLOUD — reviewed staging image only. This does NOT initialize or
# share private BRAIN CORAL state. Run schema migration separately.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist/src ./dist/src
USER node
EXPOSE 8080
CMD ["node", "dist/src/main.js"]
