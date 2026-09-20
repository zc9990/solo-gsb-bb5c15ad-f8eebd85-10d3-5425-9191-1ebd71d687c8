FROM node:20-alpine

WORKDIR /app

# 仅先拷贝依赖清单，利用 Docker 层缓存；构建时自动完成 npm install
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# 拷贝应用源码
COPY server.js ./
COPY lib ./lib
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

# 简易健康检查（wget 由 busybox 提供）
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
