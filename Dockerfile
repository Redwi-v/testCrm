FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json vite-env.d.ts ./
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache gettext
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80
