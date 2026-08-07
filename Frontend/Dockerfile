# Frontend wasmish — build Vite + servido por nginx (producción)

# --- Etapa 1: build ---
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Variables públicas de Meta (van embebidas en el bundle en build-time)
ARG VITE_META_APP_ID
ARG VITE_META_CONFIG_ID
ARG VITE_META_GRAPH_VERSION
ENV VITE_META_APP_ID=$VITE_META_APP_ID \
    VITE_META_CONFIG_ID=$VITE_META_CONFIG_ID \
    VITE_META_GRAPH_VERSION=$VITE_META_GRAPH_VERSION

RUN npm run build

# --- Etapa 2: servir estáticos ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
