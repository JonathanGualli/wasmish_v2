# Backend wasmish — Express 5 + Mongoose (producción)
FROM node:22-alpine

WORKDIR /app

# Instalar solo dependencias de producción (nodemon queda fuera)
COPY package*.json ./
RUN npm ci --omit=dev

# Código de la app
COPY . .

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
