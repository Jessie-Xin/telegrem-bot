# 镜像仓库地址（只包含域名部分）
REGISTRY_HOST = crpi-hrs23ya2cagjewua.cn-beijing.personal.cr.aliyuncs.com

# 用户名为阿里云账号全名
USERNAME = 新之助1225

# 仓库命名空间和仓库名
NAMESPACE = near-link
NAME = near

# 最终镜像完整路径
IMAGE = $(REGISTRY_HOST)/$(NAMESPACE)/$(NAME)

# Docker 配置路径（可选）
DOCKER_CONFIG_PATH = ~/.docker/$(REGISTRY_HOST)_$(NAMESPACE)

# 镜像版本号
VERSION := $(shell date +'%y.%m.%d')-$(shell git rev-parse --abbrev-ref HEAD | sed 's/[\/]/-/g')-$(shell git rev-parse --short HEAD)

SHELL = /bin/bash
DOCKER_BUILD_CONTEXT = .
DOCKER_FILE_PATH = Dockerfile
DOCKER_BUILD_ARGS = --platform linux/amd64


.PHONY: docker-build tag-docker do-push registry-login build push login

# 一键构建并推送
make: build push

# 构建阶段
build: docker-build tag-docker

# 推送阶段
push: do-push

# 登录命令
login: registry-login

# 构建镜像
docker-build:
	@echo -e "\033[32m docker build version:$(VERSION) \033[0m"
	docker build $(DOCKER_BUILD_ARGS) -t $(IMAGE):$(VERSION) $(DOCKER_BUILD_CONTEXT) -f $(DOCKER_FILE_PATH) \
	--secret id=npmrc,src=$(shell realpath ~/.npmrc)

# 打标签
tag-docker:
	@echo create tag latest
	docker tag $(IMAGE):$(VERSION) $(IMAGE):latest
	@echo create tag $(VERSION)
	docker tag $(IMAGE):$(VERSION) $(IMAGE):$(VERSION)

# 推送镜像
do-push:
	@echo publish latest to $(REGISTRY_HOST)
	docker push $(IMAGE):latest
	@echo publish $(IMAGE):$(VERSION) to $(REGISTRY_HOST)
	docker push $(IMAGE):$(VERSION)
	@echo -e "\033[32m $(IMAGE):$(VERSION) \033[0m"

# 登录镜像仓库
registry-login:
	docker login --username=$(USERNAME) $(REGISTRY_HOST)
