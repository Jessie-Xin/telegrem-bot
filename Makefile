# Telegram Bot Makefile

.PHONY: build run stop clean logs help

# 默认目标
.DEFAULT_GOAL := help

# 项目名称
PROJECT_NAME = telegram-bot

# Docker相关变量
DOCKER_COMPOSE = docker compose

# 帮助信息
help:
	@echo "使用方法:"
	@echo "  make build    - 构建Docker镜像"
	@echo "  make run      - 运行Docker容器"
	@echo "  make stop     - 停止Docker容器"
	@echo "  make restart  - 重启Docker容器"
	@echo "  make logs     - 查看容器日志"
	@echo "  make clean    - 清理Docker容器和镜像"
	@echo "  make all      - 一键构建并运行"

# 构建Docker镜像
build:
	@echo "构建Docker镜像..."
	$(DOCKER_COMPOSE) build

# 运行Docker容器
run:
	@echo "启动Docker容器..."
	$(DOCKER_COMPOSE) up -d

# 停止Docker容器
stop:
	@echo "停止Docker容器..."
	$(DOCKER_COMPOSE) down

# 重启Docker容器
restart: stop run

# 查看容器日志
logs:
	@echo "查看容器日志..."
	$(DOCKER_COMPOSE) logs -f

# 清理Docker容器和镜像
clean:
	@echo "清理Docker容器和镜像..."
	$(DOCKER_COMPOSE) down --rmi all

# 一键构建并运行
all: build run
	@echo "已完成构建并启动容器"
	@echo "使用 'make logs' 查看日志"