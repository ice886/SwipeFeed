# 后端镜像：API 与 Worker 共用（compose 中 worker 覆盖 command）
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.run/uploads
EXPOSE 8080
CMD ["node", "dist/main.js"]
