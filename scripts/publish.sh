#!/bin/bash

# ZenTao MCP Server 发布脚本
# 使用方法: ./scripts/publish.sh [patch|minor|major]

set -e

echo "🚀 ZenTao MCP Server 发布流程"
echo "================================"

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查参数
VERSION_TYPE=${1:-patch}
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo "❌ 错误: 版本类型必须是 patch, minor 或 major"
    echo "用法: $0 [patch|minor|major]"
    exit 1
fi

echo "📦 版本类型: $VERSION_TYPE"

# 1. 检查是否有未提交的更改
if [[ -n $(git status --porcelain) ]]; then
    echo "⚠️  警告: 有未提交的更改"
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 发布取消"
        exit 1
    fi
echo "✅ 继续发布..."
fi

# 2. 运行测试
echo "🧪 运行测试..."
npm test

# 3. 构建项目
echo "🔨 构建项目..."
npm run build

# 4. 检查 npm 登录状态
echo "🔐 检查 npm 登录状态..."
if ! npm whoami; then
    echo "❌ 请先登录 npm: npm login"
    exit 1
fi

# 5. 更新版本并发布
echo "📈 更新版本并发布..."
case "$VERSION_TYPE" in
    patch)
        npm run release:patch
        ;;
    minor)
        npm run release:minor
        ;;
    major)
        npm run release:major
        ;;
esac

echo "✅ 发布完成!"
echo "📦 包名: $(npm pkg get name | tr -d '"')"
echo "🏷️  版本: $(npm pkg get version | tr -d '"')"
echo "🔗 npm 地址: https://www.npmjs.com/package/$(npm pkg get name | tr -d '"')"

# 6. 显示使用说明
echo ""
echo "💡 使用说明:"
echo "   安装: npx $(npm pkg get name | tr -d '"')"
echo "   或: npm install -g $(npm pkg get name | tr -d '"')"
echo "   运行: $(npm pkg get name | tr -d '"')"