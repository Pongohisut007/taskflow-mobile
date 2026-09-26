FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app
# ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# npm/npx/corepack are not needed at runtime (CMD runs node directly)
# and ship their own vulnerable dependencies (flagged by Trivy).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "dist/src/main.js"]