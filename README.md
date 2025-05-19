# Telegram Bot

这是一个基于Node.js的Telegram机器人项目，支持多种AI模型（Gemini、腾讯混元、Cloudflare）和角色切换功能。

## 功能特点

- 支持多种AI模型：Gemini、腾讯混元、Cloudflare
- 支持角色切换功能
- 用户消息频率限制
- 完善的错误处理和日志记录
- Docker容器化部署

## 环境要求

- Node.js 18+
- Docker 和 Docker Compose (用于容器化部署)
- Make (用于一键构建和部署)

## 快速开始

### 配置环境变量

在项目根目录创建`.env`文件，包含以下配置：

```
TELEGRAM_BOT_TOKEN=你的Telegram机器人Token
GEMINI_API_KEY=你的Gemini API密钥
HUNYUAN_API_KEY=你的腾讯混元API密钥
CLOUDFLARE_API_KEY=你的Cloudflare API密钥
```

### 使用Make一键部署

项目提供了Makefile，可以使用以下命令进行操作：

```bash
# 显示帮助信息
make help

# 一键构建并运行
make all

# 仅构建Docker镜像
make build

# 仅运行Docker容器
make run

# 停止Docker容器
make stop

# 重启Docker容器
make restart

# 查看容器日志
make logs

# 清理Docker容器和镜像
make clean
```

### 手动部署

#### 开发环境

```bash
# 安装依赖
pnpm install

# 开发模式运行
pnpm dev
```

#### 生产环境

```bash
# 构建
pnpm build

# 运行
pnpm start
```

#### 使用Docker Compose

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 项目结构

```
.
├── Dockerfile          # Docker构建文件
├── Makefile            # Make构建脚本
├── docker-compose.yml  # Docker Compose配置
├── nodemon.json        # Nodemon配置
├── package.json        # 项目依赖
├── src/                # 源代码目录
│   ├── ai.ts           # AI模型接口
│   ├── bot.ts          # Telegram机器人主程序
│   └── logger.ts       # 日志模块
└── tsconfig.json       # TypeScript配置
```

## 命令说明

机器人支持以下命令：

- `/switchmodel` - 切换AI模型
- `/switchrole` - 切换AI角色

## 许可证

ISC