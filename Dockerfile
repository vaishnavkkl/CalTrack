FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/caltrack.db RESPONSE_FILES_PATH=/data/uploads
COPY apps/api apps/api
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 8080
CMD ["node", "apps/api/src/index.mjs"]
