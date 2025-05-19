FROM node:20-alpine AS builder

WORKDIR /app

# 复制package.json和pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装pnpm
RUN npm install -g pnpm

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# 生产环境镜像
FROM node:20-alpine

WORKDIR /app

# 复制package.json和pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# 安装pnpm
RUN npm install -g pnpm

# 仅安装生产依赖
RUN pnpm install --prod

# 从构建阶段复制编译后的代码
COPY --from=builder /app/dist ./dist

# 复制.env文件
COPY .env ./

# 设置环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["node", "dist/bot.js"]