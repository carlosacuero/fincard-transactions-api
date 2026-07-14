# Imagen multi-stage: compila TypeScript y ejecuta solo con dependencias de producción.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Usuario sin privilegios por seguridad.
RUN addgroup -S app && adduser -S app -G app && mkdir -p data storage && chown -R app:app /app
USER app
EXPOSE 3000
CMD ["node", "dist/index.js"]
